const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Simulated persistent token storage (use a database in production)
let tokenStore = null;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Schema for tracking clicks
const clickSchema = new mongoose.Schema({
  ownerId: String,
  linkUrl: String,
  timestamp: { type: Date, default: Date.now },
});

const Click = mongoose.model('Click', clickSchema);

// Route to initiate OAuth2 flow
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  res.redirect(authUrl);
});

// OAuth2 callback route to handle authorization code
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store tokens (you should store them in persistent storage)
    tokenStore = tokens;
    console.log('Tokens acquired and stored:', tokenStore);

    res.send('Authorization successful! You can close this window.');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Error during authentication.');
  }
});

// Middleware to check and refresh the token if necessary
async function ensureAuthenticated(req, res, next) {
  if (!tokenStore || !tokenStore.access_token) {
    return res.status(401).json({ success: false, message: 'No access token available. Please authorize the app.' });
  }

  oauth2Client.setCredentials(tokenStore);

  // Check if the token is expired and refresh it
  try {
    await oauth2Client.getAccessToken(); // This triggers a token refresh if needed
    tokenStore = oauth2Client.credentials; // Update tokenStore with refreshed tokens
    next();
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return res.status(500).json({ success: false, message: 'Failed to refresh access token.' });
  }
}

// Example protected route to get Google Analytics data
app.get('/get-link-stats', ensureAuthenticated, async (req, res) => {
  try {
    const analyticsData = google.analyticsdata('v1beta');
    const response = await analyticsData.properties.runReport({
      property: `properties/${process.env.VIEW_ID}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'eventName' }, { name: 'pagePath' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: {
              matchType: 'EXACT',
              value: 'link_click',
            },
          },
        },
      },
      auth: oauth2Client,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start the server
app.listen(4000, () => {
  console.log('Server running on port 4000');
});
