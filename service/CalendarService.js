const {google} = require('googleapis');

// Handles the logic associated with manipulating the calendar using Google API.
// Exported functions: getBookableDays, getAvailableTimeSlots, and createBooking

/**
 * Checks whether there are time slots available on a specified day. This
 * includes checking for weekends, operating hours, whether the time slot is in
 * the past, and whether the time slot has been booked. Returns true if there
 * are available time slots, returns false otherwise.
 * @param {google.auth.OAuth2} auth The OAuth2 client to get token for.
 * @param {integer} year The year containing the month to check for availability in
 * @param {integer} month The month to check for availability in
 * @param {integer} date The date to check for availability on
 */
async function isBookable(auth, year, month, date) {
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
  let timeMin = new Date(Date.UTC(year, month-1, date, 9, 0, 0, 0)); // 9AM
  let timeMax = new Date(Date.UTC(year, month-1, date, 18, 0, 0, 0)); // 6PM
  let numOfSlots = 12;
  // Check if the specified day is weekend or is within 24 hours of current time
  if (timeMax.getUTCDay() === 0 || timeMax.getUTCDay() === 6
    || ((new Date()).getTime() + (1000*60*60*24) > timeMax)) {
    return false;
  }
  // Remove time slots on the specified day that are wihin 24 hours of current
  // time
  while ((new Date()).getTime() + (1000*60*60*24) > timeMin) {
    timeMin.setMinutes(startTime.getMinutes()+45);
    numOfSlots--;
  }
  const calendar = google.calendar({version: 'v3', auth});
  let result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone: 'UTC',
    singleEvents: true,
    orderBy: 'startTime',
  });
  const events = result.data.items;
  if (events.length === numOfSlots) {
    return false;
  } else {
    return true;
  }
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
  let promises = [];
  let daysInMonth = new Date(Date.UTC(year, month, 0)).getDate();
  for (var i = 1; i <= daysInMonth; i++) {
    promises.push(isBookable(auth, year, month, i));
  }
  let results = await Promise.all(promises);
  results.map((item,i) => {
    days.push({'day': i+1, 'hasTimeSlots': (item)});
  });
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
    timeZone: 'UTC',
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
    }
    // Check if the requested time is in the past or is within 24 hours of the current date and time
    else if (startTime.getTime() > (new Date()).getTime()
      && startTime.getTime() - (new Date()).getTime() > (1000*60*60*24)) {
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
  if (!(date)) {
    throw 'Request is missing parameter: day';
  }
  if (isNaN(hour)) {
    throw 'Request is missing parameter: hour';
  }
  if (isNaN(minute)) {
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
        dateTime: endTime.toISOString(),
        timeZone: 'UTC'
      },
      start:
      {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC'
      }
    }
  });
  return response;
}

module.exports.getBookableDays = getBookableDays;
module.exports.getAvailableTimeSlots = getAvailableTimeSlots;
module.exports.createBooking = createBooking;
