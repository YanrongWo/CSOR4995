var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var moment = require('moment');
var fs = require('fs');
var csv = require('csv-stringify');

var routes = require('./routes/index');
var users = require('./routes/users');
var mysql      = require('mysql');
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

//Post function on front page
app.post('/', function (req, res) {
  res.send('Got a POST request');
  
  var utcdatetime = moment.utc().format('YYYY-MM-DD HH:mm:ss');
  var symbol = req.body.symbol;
  var expiry = req.body.expiry;
  var lots = req.body.lots;
  var price = req.body.price;
  var type = req.body.transType;
  var trader = req.body.trader;

  var connection = mysql.createConnection({
    host     : '104.131.22.150',
    user     : 'rrp',
    password : 'rrp',
    database: 'financial'
  });

  connection.connect();

  connection.query('INSERT INTO Trades VALUES ("' + symbol + '","' + expiry + '","' + lots + '","' +
    price + '","' + type + '","' + trader + '","' + utcdatetime + '");', function(err, rows, fields) {
    if (err) throw err;
    console.log('done');
  });

  connection.end();
});

//Write Trades to CSV File
function tradesToCSV(){
  var connection = mysql.createConnection(
    {
      host     : '104.131.22.150',
      user     : 'rrp',
      password : 'rrp',
      database : 'financial',
    }
  );
 
  connection.connect();
   
  var queryString = 'SELECT * FROM Trades';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    csv(rows, function(err, output){
      fs.writeFile("/trades.csv", output, function(err) {
        if (err) throw err;
        console.log('It\'s saved!');
      }); 
    });
  });
   
  connection.end();
}

tradesToCSV();

//Write Aggregate Position to CSV File
function aggregatePositionToCSV(){
  var connection = mysql.createConnection(
    {
      host     : '104.131.22.150',
      user     : 'rrp',
      password : 'rrp',
      database : 'financial',
    }
  );
 
  connection.connect();
   
  var queryString = 'SELECT symbol, sum(lots) FROM (SELECT symbol, IF(type="Buy", -1 * lots, lots) as lots FROM Trades) as typedTrades GROUP BY symbol;';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    csv(rows, function(err, output){
      fs.writeFile("/aggregatePosition.csv", output, function(err) {
        if (err) throw err;
      }); 
    });
  });
   
  connection.end();
}

aggregatePositionToCSV();

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
