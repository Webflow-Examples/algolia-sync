# Send and sync Webflow CMS data to Algolia

In this repo we'll be walking you through how to get all the content from your Webflow CMS inside of Algolia using Node.js, the Webflow API, the Algolia API, and some npm packages.

If you're looking for help displaying and implementing Algolia on the front-end in Webflow, please use these repos as a guide:

- [Algolia Instant Search](https://github.com/Webflow-Examples/algolia-instantsearch)
- [Algolia Autocomplete](https://github.com/Webflow-Examples/algolia-autocomplete)

We have two different example files to help you along the way:

- An example to help you get started if you already have data in the CMS
- An example to help you keep your data in sync if you're using Node or Express JS

## initial-upload.js

Let's get started with our first script. `initial-upload.js`. This is a Node.js file that you can run locally that will get all the content from a single collection and then send that to Algolia. Let's review the requirements and then review how the code works.

### Requirements

- Node.js
- The following npm packages

| npm package   | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| webflow-api   | Webflow Data API SDK                                                                            |
| algoliasearch | Thin & minimal low-level HTTP client to interact with Algolia's API                             |
| bottleneck    | Lightweight and zero-dependency Task Scheduler and Rate Limiter for Node.js                     |
| dotenv        | A zero-dependency module that loads environment variables from a `.env` file into `process.env` |

- .env file with the following keys:

| Key name                   | Key description                                                        |
| -------------------------- | ---------------------------------------------------------------------- |
| `WEBFLOW_API_TOKEN`        | The API token for your Webflow site                                    |
| `COLLECTION_ID`            | The ID of the collection data you are sending to Algolia               |
| `CATEGORIES_COLLECTION_ID` | The ID of your multi-reference collection                              |
| `ALGOLIA_APP_ID`           | Your Algolia [app ID](https://dashboard.algolia.com/account/api-keys)  |
| `ALGOLIA_API_KEY`          | Your Algolia [API key](https://dashboard.algolia.com/account/api-keys) |

### How it Works

This script is a Node.js program for fetching content from a Webflow site and indexing it to an Algolia search index. This is useful when you want to use Algolia's powerful search capabilities for your Webflow content.

The script uses the Webflow and Algolia APIs, along with the Bottleneck package to manage API request rates. The configuration details are stored in environment variables.

Here's a step-by-step breakdown of what the script does:

1. Import necessary modules, such as the Webflow API client (`Webflow`), the Algolia client (`algoliasearch`), and the `bottleneck` module for rate-limiting.

2. Create a Bottleneck limiter that enforces a rate limit to match Webflow's 300 RPM limit.

3. Initialize the Webflow API client using the token from the environment variables.

4. The script defines a helper function `fetchCategories` that fetches all categories from a Webflow collection. It paginates through the API results using a loop, with each loop iteration fetching a new batch of categories until all have been retrieved. Each batch of categories is appended to a list.

5. The `fetchCategories` function also transforms the list of categories into a map, where each category's ID maps to its name.

6. The `fetchAndUploadItems` function is the main function that fetches the content from Webflow and uploads it to Algolia. It first fetches the categories from Webflow. Then it loops to fetch all posts from Webflow, much like the `fetchCategories` function.

7. For each batch of posts retrieved from Webflow, the function prepares the posts for saving to Algolia by transforming them into the necessary structure, including mapping category IDs to names using the category map fetched earlier.

8. The `uploadItemsToAlgolia` function saves the posts to the Algolia search index. It initializes the Algolia client and index using the Algolia app ID and API key from the environment variables. Then it uses the `saveObjects` function of the Algolia client to save the posts to the index.

9. If there are any errors in the process, they are logged to the console.

By running this script, you can quickly sync your Webflow content to an Algolia search index, allowing you to leverage Algolia's search capabilities for your Webflow content. Algolia is a powerful search tool for large data sets and can be used for faceting large data sets as well.

![screenshot of the console log fetching categories and displaying the transformed data](https://share.cleanshot.com/0jdNSwbG)

![screenshot ot the console log when saving the items to Algolia](https://share.cleanshot.com/XSCyPj23)

### Usage

To use this script, you will need to have Node.js installed on your machine. Follow these steps:

1. **Install Dependencies**: After cloning the repository, navigate to the directory containing the script and run the command `npm install`. This will install all required dependencies as defined in your `package.json` file.

```bash
npm install
```

2. **Set Environment Variables**: As mentioned above, the script uses environment variables to safely store sensitive information like API keys. Create a `.env` file in the root of your project and add your environment variables like so:

   ```
   WEBFLOW_API_TOKEN=your-webflow-api-token
   CATEGORIES_COLLECTION_ID=your-collection-id
   ALGOLIA_APP_ID=your-algolia-app-id
   ALGOLIA_API_KEY=your-algolia-api-key
   COLLECTION_ID=your-collection-id
   ```

3. **Run the Script**: Once the dependencies are installed and environment variables set, you can run the script with `node filename.js` (replace `filename.js` with the actual filename of your script).

### Notes

- Make sure that the Webflow API token, Algolia API credentials, and collection IDs you provide have the necessary permissions to perform the operations in this script.

- The rate limiter in the script is set to respect the Webflow's rate limit of 60 requests per minute (RPM). If you have an enterprise agreement with Webflow that allows a higher rate limit, you can adjust the `minTime` in the Bottleneck limiter accordingly.

- This script doesn't handle errors beyond logging them to the console. Depending on how you intend to use the script, you might want to add more sophisticated error handling.

- The Algolia `saveObjects` method has a limit of 1MB for the total size of all objects being saved. If your Webflow posts have a lot of data, you might hit this limit and need to batch the `saveObjects` calls into smaller groups of posts.

- This script is set for two specific collections. If you have more than one referenced collection, you'll need to adjust the code to meet your needs. You'll also need to adjust the data fields being sent to Algolia to match the fields from your specific use case.

## webhook-endpoint.js

Once you have the bulk of your data saved to Algolia, you'll need to make sure it stays in sync and this code is an example of how you can do this in an Express router.

### How It Works

This Node.js application is designed as an Express router, which uses the Webflow API and Algolia's search-as-a-service to keep a real-time sync between a Webflow collection and an Algolia search index.

The application has several components:

1. **Initialization**: The application initializes the Express router, Webflow API client, and Algolia client. It also sets up a rate limiter via the Bottleneck library to control the frequency of API calls, and sets up NodeCache to cache fetched categories.

2. **Category Fetching**: The `fetchCategories` function retrieves category data from Webflow. It first checks the cache for any stored categories and uses these if available. If no cached categories are found, the function makes API calls to Webflow to fetch the categories. These categories are then transformed into a map and stored in the cache for future use.

3. **Webhook Endpoint**: The application includes a webhook endpoint (`/webhook-endpoint`) that listens for POST requests. This endpoint should be set in Webflow's webhook settings ([Events documentation](https://developers.webflow.com/reference/create-webhook) | you can add three different webhooks with the same URL – item deleted, item created, item changed). When Webflow sends an event to the endpoint, the application checks the type of event. If an item is deleted, the corresponding object is removed from Algolia. If an item is created or updated, the application fetches the current categories from the cache (or Webflow, if they are not in cache), formats the data appropriately, and updates the item in Algolia. If the event is related to another collection, the application does nothing.

![screenshot of the console logs showing events being received, categories fetched, and the items being saved to Algolia](https://share.cleanshot.com/gGd4V2VS)

### Usage

1. **Install Dependencies**: Use the `npm install` command in the directory where the script resides to install necessary dependencies.

| npm package   | Description                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------- |
| express       | Fast, unopinionated, minimalist web framework for Node.js.                                         |
| webflow-api   | Webflow Data API SDK                                                                               |
| algoliasearch | Thin & minimal low-level HTTP client to interact with Algolia's API                                |
| bottleneck    | Lightweight and zero-dependency Task Scheduler and Rate Limiter for Node.js                        |
| node-cache    | A simple caching module that has set, get and delete methods and works a little bit like memcached |
| dotenv        | A zero-dependency module that loads environment variables from a `.env` file into `process.env`    |

2. **Set Environment Variables**: Set environment variables for the Webflow API token, Algolia app ID, Algolia API key, and collection ID. This can be done in a `.env` file or through your hosting environment.

3. **Deploy the Application**: This Express router can be added to an existing Express.js application or used to create a new one. You will need to run the application on a server that can receive HTTP requests from the Webflow webhook.

4. **Set Up Webflow Webhook**: In the Webflow dashboard, set the URL of the webhook to the URL where your Express app is hosted, followed by `/webhook-endpoint`.

### Notes

- This script uses the Bottleneck library to ensure it doesn't exceed Webflow's rate limit of 60 requests per minute.

- The NodeCache library is used to cache categories for 10 minutes, which can help prevent unnecessary API calls to Webflow.

- The script uses the Algolia `saveObject` method to add or update objects in the index, and the `deleteObject` method to remove objects from the index when they're deleted in Webflow.

- Ensure that the Webflow and Algolia credentials used have the necessary permissions for the operations performed by the script.

- This script only works for a single collection in Webflow. If you want to use it with multiple collections, you will need to modify the script or create separate instances of it for each collection.
