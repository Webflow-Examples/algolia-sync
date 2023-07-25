// Global variables and imports
const express = require("express");
const algoliasearch = require("algoliasearch");
const Webflow = require("webflow-api");
const router = express.Router();
const Bottleneck = require("bottleneck");
const NodeCache = require("node-cache");

// setup Bottleneck to limit API calls to 1 per second (60RPM)
const limiter = new Bottleneck({
  minTime: 1000,
});

// initialize Webflow API client
const webflow = new Webflow({
  token: process.env.WEBFLOW_API_TOKEN,
});

// Set the ID for the multi-reference field that holds categories
const categoriesCollectionId = process.env.CATEGORIES_COLLECTION_ID;

// setup NodeCache to cache categories for 10 minutes
const myCache = new NodeCache({ stdTTL: 600, checkperiod: 600 });

// fetch categories from Webflow
async function fetchCategories() {
  // check if categories are cached
  let categories = myCache.get("categories");
  if (categories) {
    console.log("Using cached categories");
  } else {
    const webflowLimit = 100;
    let currentOffset = 0;
    categories = [];
    console.log("No cached categories, fetching from Webflow");

    // Fetch categories from Webflow
    // loop through all categories
    while (true) {
      try {
        const fetchedCategories = await limiter.schedule(() =>
          webflow.get(
            `/collections/${categoriesCollectionId}/items?limit=${webflowLimit}&offset=${currentOffset}`
          )
        );

        if (!fetchedCategories.data.items) {
          console.error("fetchedCategories.data.items is undefined!");
        }

        categories = categories.concat(fetchedCategories.data.items);

        if (fetchedCategories.data.items.length < webflowLimit) {
          break;
        }
        currentOffset += webflowLimit;
        console.log(
          "Fetching more categories from Webflow at offset",
          currentOffset
        );
      } catch (error) {
        console.error("Webflow API error:", error);
      }
    }

    // transform categories into a map
    const categoriesMap = transformCategories(categories);
    console.log("Categories fetched from Webflow");
    myCache.set("categories", categoriesMap);
    categories = categoriesMap;
  }

  return categories;
}

// function to transform categories into a map
const transformCategories = (categories) => {
  return categories.reduce((map, category) => {
    map[category._id] = category.name;
    return map;
  }, {});
};

// initialize Algolia client
const client = algoliasearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_API_KEY
);
const index = client.initIndex("posts");

// Webhook endpoint
router.post("/webhook-endpoint", async (req, res) => {
  try {
    console.log("Event received");
    const data = req.body;

    // if the event is a delete event, delete the object from Algolia
    if (data.deleted) {
      console.log("This is a delete event");
      console.log(`Deleting object ${data.itemId} from Algolia`);
      index
        .deleteObject(data.itemId)
        .then(() => {
          console.log(`Deleted object ${data.itemId} from Algolia`);
          res.status(200).send("OK");
        })
        .catch((err) => {
          console.error("Error deleting object from Algolia: ", err);
          res.status(500).send("Error");
        });
    }
    // if the event is creating or updating an item in my specific collection
    // fetch categories from Webflow and save the object to Algolia
    else if (data._cid === process.env.COLLECTION_ID) {
      console.log("This is a create or update event");
      // fetch categories from Webflow
      const categoriesMap = await fetchCategories();
      const categories = data.categories
        ? data.categories.map((id) => categoriesMap[id])
        : [];

      // create object to save to Algolia
      const objectToUpdate = {
        objectID: data._id,
        name: data.name,
        slug: data.slug,
        summary: data["post-summary"],
        categories: categories,
        image: data["main-image"] ? data["main-image"].url : null,
      };
      console.log(
        `Saving object to Algolia: ${JSON.stringify(objectToUpdate)}`
      );
      // save object to Algolia
      index
        .saveObject(objectToUpdate)
        .then(({ objectID }) => {
          console.log(`Saved object ${objectID} to Algolia`);
          res.status(200).send("OK");
        })
        .catch((err) => {
          console.error("Error saving object to Algolia: ", err);
          res.status(500).send("Error");
        });
    } else {
      // if the event is creating or updating an
      // item in a different collection do nothing
      console.log("Do nothing, this is not the Articles collection");
    }
  } catch (error) {
    console.error("Error in /webhook-endpoint: ", error);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
