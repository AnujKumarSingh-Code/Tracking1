const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
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

// Route to track clicks
app.post('/track-click', async (req, res) => {
  const { ownerId, linkUrl } = req.body;

  try {
    const newClick = new Click({
      ownerId,
      linkUrl,
    });

    await newClick.save();
    res.status(200).json({ success: true, message: 'Click tracked successfully' });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ success: false, message: 'Failed to track click.' });
  }
});

// Route to fetch click stats for each user
app.get('/get-click-stats/:ownerId', async (req, res) => {
  const ownerId = req.params.ownerId;

  try {
    const clicks = await Click.aggregate([
      { $match: { ownerId } },
      {
        $group: {
          _id: '$linkUrl',
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json(clicks);
  } catch (error) {
    console.error('Error fetching click stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch click stats.' });
  }
});

// OAuth2 flow
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  res.redirect(authUrl);
});

// OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    tokenStore = tokens; // Store tokens in persistent storage (for production use)

    res.send('Authorization successful! You can close this window.');
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
    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      tokenStore = credentials; // Update tokenStore with refreshed tokens
    }
    next();
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return res.status(500).json({ success: false, message: 'Failed to refresh access token.' });
  }
}


app.get('/get-link-stats', ensureAuthenticated, async (req, res) => {
  
 const { ownerId } = req.query;

  try {
    const analyticsData = google.analyticsdata('v1beta');

    // Make the API request to GA4
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
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'eventName',
                  stringFilter: {
                    matchType: 'EXACT',
                    value: 'link_click', 
                  },
                },
              },
              {
                filter: {
                  fieldName: 'customEvent:owner_id',
                  stringFilter: {
                    matchType: 'EXACT',
                    value: ownerId, // Replace with the actual owner_id
                  },
                },
              }
            ],
          },
        },
      },
      auth: oauth2Client,  // OAuth client authentication
    });

    // Send the API response back to the client
    res.status(200).json(response.data);

  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ success: false, message: 'Error fetching Google Analytics data.' });
  }
});




// Start the server
app.listen(4000, () => {
  console.log('Server running on port 4000');
});
