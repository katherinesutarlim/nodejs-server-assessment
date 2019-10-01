# nodejs-server-assessment
Created for the Node JS Assessment on 2Hats

## Endpoints:
* `GET  /days?year=yyyy&month=mm` returns whether each day in a month has any available time slot. Time slot availability is based on weekend/weekday, operating hours, and whether time slots are booked
* `GET  /timeslots?year=yyyy&month=mm&day=dd` returns available time slots on the specified day. Time slot availability is based on weekend/weekday, operating hours, and whether time slots are booked
* `POST  /book?year=yyyy&month=MM&day=dd&hour=hh&minute=mm` books an available time slot. Time slot can be booked if it's available, not in the past, as not within 24 hours from current time

## How to run:
1. Clone the repository
2. Navigate to the project root folder on your local machine, then run `npm install`
3. Run the server with `node server.js`
