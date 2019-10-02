const url = require('url');
var http = require('http');
const authenticationService = require('./service/AuthenticationService');
const calendarService = require('./service/CalendarService');

function runServer(auth) {
  //create a server object:
  http.createServer(function (req, res) {
    let reqURL = req.url;
    const currentURL = new URL("http://127.0.0.1"+reqURL);
    const searchParams = currentURL.searchParams;
    if (req.method === 'GET' && currentURL.pathname ==='/days') {
      const year = parseInt(searchParams.get('year'));
      const month = parseInt(searchParams.get('month'));
      daysInMonth = new Date(Date.UTC(year, month-1, 0)).getUTCDate();
      calendarService.getBookableDays(auth, year, month)
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
      calendarService.getAvailableTimeSlots(auth, year, month, day)
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
      const year = parseInt(searchParams.get('year'),10);
      const month = parseInt(searchParams.get('month'),10);
      const day = parseInt(searchParams.get('day'),10);
      const hour = parseInt(searchParams.get('hour'),10);
      const minute = parseInt(searchParams.get('minute'),10);
      calendarService.createBooking(auth, year, month,day, hour, minute)
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

authenticationService.runWithAuth(runServer);
