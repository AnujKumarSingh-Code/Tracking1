const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
const open = require('open');  // Add this package to open URLs in the browser
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

let tokenStore = null;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect('mongodb+srv://anujkumarsinghcoder:QgSvKNYjniJWzg0F@project-anal.amlt0ce.mongodb.net/?retryWrites=true&w=majority&appName=project-anal');

// MongoDB Schema for tracking clicks
const clickSchema = new mongoose.Schema({
  ownerId: String,
  linkUrl: String,
  timestamp: { type: Date, default: Date.now },
});
const Click = mongoose.model('Click', clickSchema);

// OAuth2 flow
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  
  // Automatically open the auth URL in the browser
  open(authUrl);
  
  res.send('Authorization process started. Check your browser.');
});

// OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    tokenStore = tokens;

    // Automatically proceed to fetch link stats after authentication
    res.redirect('/get-link-stats');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Error during authentication.');
  }
});

// Middleware to check and refresh token
async function ensureAuthenticated(req, res, next) {
  if (!tokenStore || !tokenStore.access_token) {
    return res.status(401).json({ success: false, message: 'No access token available. Please authorize the app.' });
  }

  oauth2Client.setCredentials(tokenStore);

  try {
    // Refresh token if necessary
    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      tokenStore = credentials;
    }
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

    const [response] = await analyticsData.properties.runReport({
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

// Start the server and trigger the /auth route automatically
app.listen(4000, () => {
  console.log('Server running on port 4000');
  
  // Automatically start the OAuth flow when the server starts
  open('https://tracking1.onrender.com/auth');
});
