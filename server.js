const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const url = require('url');
var http = require('http');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Checks each day in a speciied month and return whether there are time slots
 * available on that day. This includes checking for weekends, operating hours,
 * and whether the time slot has been booked. Returns an array in the format
 * [{'day': 1, 'hasTimeSlots': [true/false]}, ...]
 * @param {google.auth.OAuth2} auth The OAuth2 client to get token for.
 * @param {integer} year The year containing the month to get bookable days from
 * @param {integer} month The month to get bookable days from
 */
async function getBookableDays(auth, year, month) {
  // Check for invalid or missing parameters
  if (!year) {
    throw 'Request is missing parameter: year';
  }
  if (!month) {
    throw 'Request is missing parameter: month';
  }
  let days = new Array();
  let daysInMonth = new Date(Date.UTC(year, month, 0)).getDate();
  let promises = [];
  for (var i = 1; i<=daysInMonth; i++) {
    promises.push(getAvailableTimeSlots(auth, year, month, i));
  }
  const results = await Promise.all(promises);
  // Push values into the  results array object to be returned.
  results.map((timeSlots, i) => {
    days.push({'day': i+1, 'hasTimeSlots': (timeSlots.length > 0)})
  })
  return(days);
}

/**
 * Lists all avaiilable time slots in a specified date. This includes checking
 * for weekends, operating hours, and whether the time slot has been booked.
 * Returns an array in the format
 * [{'startTime': [startTimeISOString], 'endTime': [endTimeISOString]}, ...]
 * @param {google.auth.OAuth2} auth The OAuth2 client to get token for.
 * @param {integer} year The year of the specified date to get time slots of
 * @param {integer} month The month of the specified date to get time slots of
 * @param {integer} date The day of the month to get time slots of
 */
async function getAvailableTimeSlots(auth, year, month, date) {
  // Check for invalid or missing parameters
  if (!year) {
    throw 'Request is missing parameter: year';
  }
  if (!month) {
    throw 'Request is missing parameter: month';
  }
  if (!date) {
    throw 'Request is missing parameter: day';
  }
  timeMin = new Date(Date.UTC(year, month-1, date, 9, 0, 0, 0)); // 9AM
  timeMax = new Date(Date.UTC(year, month-1, date, 18, 0, 0, 0)); // 6PM
  // Check if the specified day is weekend
  if (timeMax.getUTCDay() === 0 || timeMax.getUTCDay() === 6) {
    return new Array();
  }
  const calendar = google.calendar({version: 'v3', auth});
  let result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  const events = result.data.items;
  const numOfEvents = events.length;
  let timeSlots = new Array();
  let i = 0;
  let startTime = new Date(Date.UTC(year, month-1, date, 9, 0, 0, 0));
  let endTime = new Date(Date.UTC(year, month-1, date, 9, 40, 0, 0));
  while (endTime.getTime() < timeMax.getTime()) {
    if (i < numOfEvents && startTime.getTime() === Date.parse(events[i].start.dateTime)) {
      i++
    } else {
      timeSlots.push({'startTime': startTime.toISOString(), 'endTime': endTime.toISOString()});
    }
    // Add 45 minutes to start and end time, 40 minutes for the appointment and
    // 5 minuts for break
    startTime.setMinutes(startTime.getMinutes()+45);
    endTime.setMinutes(endTime.getMinutes()+45);
  }
  return timeSlots;
}

/**
 * Books a time slote at a specified date and starting time. Returns the
 * response from Google API upon successful event insertion. Throws exceptions
 * in the form of String error meessage to be handled by the caller.
 * @param {google.auth.OAuth2} auth The OAuth2 client to get token for.
 * @param {integer} year The year of the requested booking
 * @param {integer} month The month of the requested booking
 * @param {integer} date The day of the month of the requested booking
 * @param {integer} hour The hour of the requested booking
 * @param {integer} minute The minute of the requested booking
 */
async function createBooking(auth, year, month, date, hour, minute) {
  // Check for invalid booking requests
  if (!year) {
    throw 'Request is missing parameter: year';
  }
  if (!month) {
    throw 'Request is missing parameter: month';
  }
  if (!date) {
    throw 'Request is missing parameter: day';
  }
  if (!hour) {
    throw 'Request is missing parameter: hour';
  }
  if (!minute) {
    throw 'Request is missing parameter: minute';
  }
  const startTime = new Date(Date.UTC(year, month-1, date, hour, minute, 0, 0));
  const endTime = new Date(Date.UTC(year, month-1, date, hour, minute+40, 0, 0));
  // Check if requested time is in the past
  if (startTime.getTime() < (new Date()).getTime()) {
    throw "Cannot book time in the past";
  }
  // Check if the requested time is within 24 hours of the current date and time
  if (startTime.getTime() - (new Date()).getTime() < (1000*60*60*24)) {
    throw "Cannot book with less than 24 hours in advance";
  }
  let timeMin = new Date(Date.UTC(year, month-1, date, 9, 0, 0, 0));
  let timeMax = new Date(Date.UTC(year, month-1, date, 18, 0, 0, 0));
  // Check if the requested time occurs on weekends or is outside operating hours
  if (startTime.getUTCDay() == 0 || startTime.getUTCDay() == 6
    || startTime.getTime() < timeMin.getTime()
    || endTime.getTime() > timeMax.getTime()) {
    throw "Cannot book outside bookable timeframe";
  }
  // Check if time slot is a valid fixed time
  const timeSlots = await getAvailableTimeSlots(auth, year, month, date);
  let timeSlotIsValid = false;
  for (var i = 0; i < timeSlots.length; i++) {
    if (startTime.toISOString() === timeSlots[i]['startTime']) {
      timeSlotIsValid = true;
      break;
    }
  }
  if (!timeSlotIsValid) {
    throw "Invalid time slot";
  }
  const calendar = google.calendar({version: 'v3', auth});
  let response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      end:
      {
        dateTime: endTime.toISOString()
      },
      start:
      {
        dateTime: startTime.toISOString()
      }
    }
  });
  return response;
}

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content), runServer);
});

function runServer(auth) {
  //create a server object:
  http.createServer(function (req, res) {
    // res.writeHead(200, {'Content-Type': 'application/json'}); // http header
    // res.end(JSON.stringify({ a: 1 }));
    let reqURL = req.url;
    const currentURL = new URL("http://127.0.0.1"+reqURL);
    const searchParams = currentURL.searchParams;
    if (req.method === 'GET' && currentURL.pathname ==='/days') {
      const year = parseInt(searchParams.get('year'));
      const month = parseInt(searchParams.get('month'));
      daysInMonth = new Date(Date.UTC(year, month-1, 0)).getUTCDate();
      getBookableDays(auth, year, month)
      .then((days) => {
        res.write(JSON.stringify({
          'success': true,
          'days': days
        }));
        res.end();
      })
      .catch((err) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          'success': false,
          'message': err
        }));
      })
    } else if(req.method === 'GET' && currentURL.pathname ==='/timeslots') {
      const year = parseInt(searchParams.get('year'));
      const month = parseInt(searchParams.get('month'));
      const day = parseInt(searchParams.get('day'));
      getAvailableTimeSlots(auth, year, month, day)
      .then((timeSlots) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          'success': true,
          'timeSlots': timeSlots
        }));
      })
      .catch((err) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          'success': false,
          'message': err
        }));
      })
    } else if(req.method === 'POST' && currentURL.pathname ==='/book') {
      const year = parseInt(searchParams.get('year'));
      const month = parseInt(searchParams.get('month'));
      const day = parseInt(searchParams.get('day'));
      const hour = parseInt(searchParams.get('hour'));
      const minute = parseInt(searchParams.get('minute'));
      createBooking(auth, year, month,day, hour, minute)
      .then((response) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          'success': true,
          'startTime': response.data.start.dateTime,
          'endTime': response.data.end.dateTime,
        }));
      })
      .catch((err) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          'success': false,
          'message': err
        }));
      })
    } else {
      res.end('<h1>Welcome!</h1>');
    }
  }).listen(3000, function(){
    console.log("server start at port 3000"); //the server object listens on port 3000
  });
}
