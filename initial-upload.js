const Webflow = require("webflow-api");
const algoliasearch = require("algoliasearch");
const bottleneck = require("bottleneck");
const env = require("dotenv").config();

// Set API rate limit to meet Webflow's 300 RPM limit
const limiter = new bottleneck({
  minTime: 400, // 200 RPM is for ENT limits set to 400 for safety, use 1000 for 60 RPM
});

// Initialize Webflow API client
const webflow = new Webflow({
  token: process.env.WEBFLOW_API_TOKEN,
});

// Set the ID for the multi-reference field that holds categories
const categoriesCollectionId = process.env.CATEGORIES_COLLECTION_ID;

// Fetch categories from Webflow
async function fetchCategories() {
  console.log("Fetching categories from Webflow...");
  const webflowLimit = 100;
  let currentOffset = 0;
  let categories = [];

  // Fetch categories from Webflow
  // loop through all categories
  while (true) {
    try {
      const fetchedCategories = await limiter.schedule(() =>
        webflow.get(
          `/collections/${categoriesCollectionId}/items?limit=${webflowLimit}&offset=${currentOffset}`
        )
      );

      categories = categories.concat(fetchedCategories.data.items);

      if (fetchedCategories.data.items.length === webflowLimit) {
        currentOffset += webflowLimit;
        console.log(
          "Fetching more categories from Webflow at offset",
          currentOffset
        );
      } else {
        break;
      }
    } catch (error) {
      console.error("Webflow API error:", error);
    }
  }

  // Transform categories into a map
  const categoriesMap = transformCategories(categories);
  console.log("Categories fetched from Webflow");
  console.log(categoriesMap);

  return categoriesMap;
}

// Function to transform categories into a map
const transformCategories = (categories) => {
  return categories.reduce((map, category) => {
    map[category._id] = category.name;
    return map;
  }, {});
};

async function fetchAndUploadItems() {
  // Fetch categories from Webflow
  const categoryMap = await fetchCategories();
  const webflowLimit = 100;
  let currentOffset = 0;
  let allPosts = [];
  let objectsToSave = [];

  // Fetch posts from Webflow
  // loop through all posts
  while (true) {
    try {
      const items = await webflow.get(
        `/collections/${process.env.COLLECTION_ID}/items?limit=${webflowLimit}&offset=${currentOffset}`
      );
      // after each page we're saving the posts to Algolia
      // if you have a lot of items, you might want to save them in batches
      // to avoid hitting Algolia's rate limits
      // Algolia has a 1MB limit on the size of each batch
      allPosts = allPosts.concat(items.data.items);
      if (items.data.items.length === webflowLimit) {
        objectsToSave = items.data.items.map((item) => ({
          objectID: item._id,
          name: item.name,
          slug: item.slug,
          summary: item["post-summary"],
          categories: item.categories
            ? item.categories.map((id) => categoryMap[id])
            : [],
          image: item["thumbnail-image"] ? item["thumbnail-image"].url : null,
        }));
        uploadItemsToAlgolia(objectsToSave);
        currentOffset += webflowLimit;
        continue;
      } else {
        // if there are no more posts to fetch,
        // save the last batch of posts to Algolia and break out of the loop
        objectsToSave = items.data.items.map((item) => ({
          objectID: item._id,
          name: item.name,
          slug: item.slug,
          summary: item["post-summary"],
          categories: item.categories
            ? item.categories.map((id) => categoryMap[id])
            : [],
          image: item["thumbnail-image"] ? item["thumbnail-image"].url : null,
        }));
        uploadItemsToAlgolia(objectsToSave);
        break;
      }
    } catch (error) {
      console.error("Webflow API error:", error);
    }
  }
}

// Function to upload items to Algolia
function uploadItemsToAlgolia(objectsToSave) {
  const client = algoliasearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY
  );
  const index = client.initIndex("posts");
  index
    .saveObjects(objectsToSave, { autoGenerateObjectIDIfNotExist: true })
    .then(({ objectIDs }) => {
      objectIDs.forEach((objectID, i) => {
        console.log(
          `${objectsToSave[i].name} in ${objectsToSave[i].categories} has been saved to Algolia as ${objectID}`
        );
      });
    })
    .catch((err) => {
      console.error("Error saving objects to Algolia: ", err);
    });
}

// Fetch and upload items to Algolia
fetchAndUploadItems().catch((error) => {
  console.error("Error fetching items from Webflow: ", error);
});
