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


const tokenSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  expiry_date: Number,
});

const Token = mongoose.model('Token', tokenSchema);


const clickSchema = new mongoose.Schema({
  ownerId: String,
  linkUrl: String,
  eventCount: { type: Number, default: 0 }, 
});

const Click = mongoose.model('Click', clickSchema);

let tokenStore = null; 

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


mongoose.connect(
  'mongodb+srv://anujkumarsinghcoder:QgSvKNYjniJWzg0F@project-anal.amlt0ce.mongodb.net/?retryWrites=true&w=majority&appName=project-anal'
);


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



app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', 
    prompt: 'consent',      
    scope: scopes,
  });

  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    
    const { tokens } = await oauth2Client.getToken(code);

    
    if (tokens.refresh_token) {
      console.log('Refresh token received:', tokens.refresh_token);
    } else {
      console.log('No refresh token received.');
    }

    
    await saveTokensToDB(tokens);
    res.status(200).send('Tokens saved successfully!');

  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Failed to authenticate with Google.');
  }
});



cron.schedule('* * * * *', async () => {
  console.log('Running cron job to refresh access token and fetch Google Analytics data');
  
  try {
    
    await getTokensFromDB();

    
    if (tokenStore && tokenStore.refresh_token) {
      oauth2Client.setCredentials({
        refresh_token: tokenStore.refresh_token,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      tokenStore = credentials;
      await saveTokensToDB(credentials); 
      console.log('Access token refreshed by cron job');
    } else {
      console.log('No refresh token available, authorization is required.');
      return;
    }

    
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
              value: 'link_click', 
            },
          },
        },
      },
      auth: oauth2Client,
    });

   
    for (const row of response.data.rows) {
  const [eventName, ownerId, linkUrl] = row.dimensionValues.map(dim => dim.value);
  const eventCount = parseInt(row.metricValues[0].value, 10); 

  
  if (isNaN(eventCount)) {
    console.error(`Invalid eventCount for link ${linkUrl}: ${row.metricValues[0].value}`);
    continue; 
  }
  
  
  const filter = { ownerId, linkUrl };
  const update = { $set: { eventCount } };

  await Click.updateOne(filter, update, { upsert: true }); 
}


    console.log('Google Analytics data fetched and updated in MongoDB.');
  } catch (error) {
    console.error('Error in cron job (refresh token or fetching data):', error);
  }
});


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


app.listen(4000, () => {
  console.log('Server running on port 4000');
});
