import { RxCollection, RxDocument } from 'rxdb/plugins/core';
import { euclideanDistance, indexNrToString, sortByObjectNumberProperty } from './database';
import { INDEX_VECTORS } from '../utils/indexVectors';
import { getVectorFromTextWithWorker } from './worker-scheduler';
import { RxDatabase, getFromMapOrThrow } from 'rxdb/plugins/core';

export async function vectorSearchFullScan(vectorCollection: RxCollection, searchEmbedding: number[]) {
    const candidates = await vectorCollection.find().exec();
    console.log('after fetch ' + performance.now());
    const withDistance = candidates.map(doc => ({ doc, distance: euclideanDistance(searchEmbedding, doc.embedding) }))
    console.log('after distance ' + performance.now());
    const queryResult = withDistance.slice(0).sort(sortByObjectNumberProperty('distance')).reverse();
    console.log('after sorted ' + performance.now());
    console.dir({ withDistance, queryResult });
    return {
        result: queryResult.slice(0, 10),
        docReads: candidates.length
    };
};

export async function vectorSearchIndexRange(vectorCollection: RxCollection, searchEmbedding: number[]) {
    console.log('vectorSearchIndexRange started');
    console.log('Inspecting vectorCollection:');
    console.log('Collection name:', vectorCollection.name);
    console.log('Collection schema:', vectorCollection.schema.jsonSchema);

    // Verify the collection has documents
    const count = await vectorCollection.count().exec();
    console.log(`Number of documents in collection: ${count}`);

    // Try a simpler query to test basic functionality
    const allDocs = await vectorCollection.find().limit(5).exec();
    console.log('Sample documents:', allDocs.map(doc => doc.toJSON()));

    // Check indexes
    console.log('Collection indexes:', vectorCollection.schema.indexes);

    const indexDistance = 0.01;
    const candidates = new Set<RxDocument>();
    let docReads = 0;
    try {
        for (let i = 0; i < 5; i++) {
            console.log(`Processing index ${i}`);
            const distanceToIndex = euclideanDistance(INDEX_VECTORS[i], searchEmbedding);
            console.log(`Distance to index ${i}: ${distanceToIndex}`);

            const range = distanceToIndex * indexDistance;
            console.log(`Range for index ${i}: ${range}`);

            // Check the specific field you're querying
            const fieldName = `idx${i}`;
            const docsWithField = await vectorCollection.find({
                selector: {
                    [fieldName]: { $exists: true }
                }
            }).limit(5).exec();
            console.log(`Sample documents with ${fieldName}:`, docsWithField.map(doc => doc.toJSON()));

            try {
                console.log(`Querying for index ${i} with range:`, {
                    gt: indexNrToString(distanceToIndex - range),
                    lt: indexNrToString(distanceToIndex + range)
                });
                const docs = await vectorCollection.find({
                    selector: {
                        [fieldName]: {
                            $gt: indexNrToString(distanceToIndex - range),
                            $lt: indexNrToString(distanceToIndex + range)
                        }
                    },
                    sort: [{ [fieldName]: 'asc' }],
                }).exec();
                console.log(`Query for index ${i} completed`);
                console.log(`Found ${docs.length} documents for index ${i}`);
                docs.forEach(d => candidates.add(d));
                docReads += docs.length;
            } catch (error) {
                console.error(`Error processing index ${i}:`, error);
            }
        }

        console.log('Processing candidates');
        const docsWithDistance = Array.from(candidates).map(doc => {
            const distance = euclideanDistance((doc as any).embedding, searchEmbedding);
            return {
                distance,
                doc
            };
        });
        console.log(`Processed ${docsWithDistance.length} candidates`);

        const sorted = docsWithDistance.sort(sortByObjectNumberProperty('distance')).reverse();
        console.log('Sorting completed');
        console.log('vectorSearchIndexRange completed');
        return {
            result: sorted.slice(0, 10),
            docReads
        };
    } catch (error) {
        console.error('Error in vectorSearchIndexRange:', error);
        throw error;
    }
};

async function keywordSearch(db: RxDatabase, query: string): Promise<any[]> {
    const keywords = query.toLowerCase().split(/\s+/)
        .filter(keyword => keyword.length > 0);

    if (keywords.length === 0) {
        return [];
    }

    // Fetch all items
    const allItems = await db.items.find().exec();

    // Filter items based on keywords
    const results = allItems.filter(doc => {
        const sourceWords = doc.source.toLowerCase().split(/\s+/);
        return keywords.some(keyword => sourceWords.includes(keyword));
    });

    return results.map(doc => ({
        id: doc.id,
        source: doc.source,
        body: doc.body,
        score: 1 // We'll use a fixed score for keyword matches
    }));
}


export async function similaritySearch(db: RxDatabase, query: string, topK: number = 2) {
    console.log('Starting similarity search for query:', query);
    
    // Add 'GPU' before 'market' or 'markets' in the query
    const modifiedQuery = query.replace(/\b(market|markets)\b/gi, 'GPU $1');

    // Perform keyword search first
    const keywordResults = await keywordSearch(db, modifiedQuery);
    console.log('Keyword search results:', keywordResults);

    if (keywordResults.length > 0) {
        console.log('Keyword matches found. Returning keyword results.');
        return keywordResults.slice(0, topK);
    }

    console.log('No keyword matches found. Proceeding with vector search.');

    // If no keyword matches, proceed with vector search
    const queryEmbedding = await getVectorFromTextWithWorker(modifiedQuery);
    console.log('Query embedding generated.');

    const vectorResults = await vectorSearchIndexRange(db.vectors, queryEmbedding);
    console.log('Vector search results:', vectorResults.result.slice(0, 5));

    const sourceDocs = await db.items.findByIds(vectorResults.result.map((r: any) => r.doc.primary)).exec();

    const finalResults = vectorResults.result.slice(0, topK).map((r: any) => {
        const doc = getFromMapOrThrow(sourceDocs, r.doc.primary);
        return {
            id: doc.id,
            source: doc.source,
            body: doc.body,
            score: r.distance
        };
    });

    console.log('Final search results:', finalResults);
    return finalResults;
}
