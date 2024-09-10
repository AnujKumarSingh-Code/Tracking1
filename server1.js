const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
const cron = require('node-cron');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// MongoDB Schema for storing OAuth tokens
const tokenSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  expiry_date: Number,
});

const Token = mongoose.model('Token', tokenSchema);

// MongoDB Schema for tracking clicks
const clickSchema = new mongoose.Schema({
  ownerId: String,
  linkUrl: String,
  eventCount: { type: Number, default: 0 }, // Store the event count from Google Analytics
});

const Click = mongoose.model('Click', clickSchema);

let tokenStore = null; // Tokens loaded here

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(
  'mongodb+srv://anujkumarsinghcoder:QgSvKNYjniJWzg0F@project-anal.amlt0ce.mongodb.net/?retryWrites=true&w=majority&appName=project-anal'
);

// Function to save tokens to MongoDB
async function saveTokensToDB(tokens) {
  try {
    const tokenDoc = await Token.findOne();
    if (tokenDoc) {
      tokenDoc.access_token = tokens.access_token;
      tokenDoc.refresh_token = tokens.refresh_token || tokenDoc.refresh_token;
      tokenDoc.expiry_date = tokens.expiry_date;
      await tokenDoc.save();
    } else {
      const newToken = new Token(tokens);
      await newToken.save();
    }
  } catch (error) {
    console.error('Error saving tokens to MongoDB:', error);
  }
}

// Function to get tokens from MongoDB
async function getTokensFromDB() {
  try {
    const tokenDoc = await Token.findOne();
    if (tokenDoc) {
      tokenStore = tokenDoc.toObject();
      oauth2Client.setCredentials({
        access_token: tokenStore.access_token,
        refresh_token: tokenStore.refresh_token,
        expiry_date: tokenStore.expiry_date,
      });
    }
  } catch (error) {
    console.error('Error fetching tokens from MongoDB:', error);
  }
}


// Route to initiate OAuth flow and get first-time token
app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly', // Add necessary scopes
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Needed to get a refresh token
    prompt: 'consent',      // Forces Google to show the consent screen to get a refresh token
    scope: scopes,
  });

  res.redirect(authUrl);
});

// Callback route to handle OAuth response and save the token
// Callback route to handle OAuth response and save the token
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Check if the refresh token is present
    if (tokens.refresh_token) {
      console.log('Refresh token received:', tokens.refresh_token);
    } else {
      console.log('No refresh token received.');
    }

    // Save tokens to the database
    await saveTokensToDB(tokens);
    res.status(200).send('Tokens saved successfully!');

  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Failed to authenticate with Google.');
  }
});


// Cron job to refresh token, fetch data from Google Analytics, and update MongoDB
cron.schedule('* * * * *', async () => {
  console.log('Running cron job to refresh access token and fetch Google Analytics data');
  
  try {
    // Fetch tokens from the DB
    await getTokensFromDB();

    // Refresh the access token if it exists
    if (tokenStore && tokenStore.refresh_token) {
      oauth2Client.setCredentials({
        refresh_token: tokenStore.refresh_token,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      tokenStore = credentials;
      await saveTokensToDB(credentials); // Save updated tokens
      console.log('Access token refreshed by cron job');
    } else {
      console.log('No refresh token available, authorization is required.');
      return;
    }

    // Make the API request to Google Analytics after refreshing the token
    const analyticsData = google.analyticsdata('v1beta');
    const response = await analyticsData.properties.runReport({
      property: `properties/${process.env.VIEW_ID}`, 
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'eventCount' }], 
        dimensions: [
          { name: 'eventName' }, 
          { name: 'customEvent:owner_id' }, 
          { name: 'customEvent:link_url' }  
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: {
              matchType: 'EXACT',
              value: 'link_click', // Filter for 'link_click' event
            },
          },
        },
      },
      auth: oauth2Client,
    });

    // Process the data and update MongoDB for each user (ownerId) and linkUrl

    // console.log(response.data);
    const rows = response.data.rows;
    for (const row of rows) {
      const [eventName, ownerId, linkUrl, eventCount] = row.dimensionValues.map(dim => dim.value);

      // Find the document in MongoDB and update the click count
      console.log(row)
      const filter = { ownerId, linkUrl };
      const update = { $set: { eventCount: parseInt(eventCount, 10) } }; // Update event count

      // await Click.updateOne(filter, update, { upsert: true }); // Upsert: if not found, create it
    }

    console.log('Google Analytics data fetched and updated in MongoDB.');
  } catch (error) {
    console.error('Error in cron job (refresh token or fetching data):', error);
  }
});

// Route to get click data from MongoDB by ownerId
app.get('/get-click-data/:ownerId', async (req, res) => {
  const ownerId = req.params.ownerId;

  try {
    const clickData = await Click.find({ ownerId });
    res.status(200).json(clickData);
  } catch (error) {
    console.error('Error fetching click data from MongoDB:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch click data.' });
  }
});

// Start the server
app.listen(4000, () => {
  console.log('Server running on port 4000');
});
