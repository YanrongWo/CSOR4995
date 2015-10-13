var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var mysql = require('mysql');

var loadIndex = require('./routes/loadIndex');
var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, 'public', 'logo.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);


//Redirect to home page if not post reuqest
app.get('/newUser', function(req, res){
  res.redirect('/');
});

//Adds a new user to Trader table
app.post('/newUser', function(req, res){

  var first = req.body.first;
  var last = req.body.last;

  if (!first || !last)
  {
      loadIndex.loadIndexWithMessage(res, "Must provide both first and last name.")
  }

  var connection = mysql.createConnection(
    {
      host     : '104.131.22.150',
      user     : 'rrp',
      password : 'rrp',
      database : 'financial',
    }
  );
 
  connection.connect();

  var queryString = 'INSERT INTO Trader VALUES (NULL,"' + first + '", "' + last + '");';

  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    queryString = "SELECT LAST_INSERT_ID();"
    connection.query(queryString, function(err, rows, fields) {
      if (err) throw err;
      connection.end();
      loadIndex.loadIndexWithMessage(res, 'Success! Your userID is ' + rows[0]['LAST_INSERT_ID()'] + ".");
    });
  });
});

//Write Trades to CSV File
app.get('/CSVTrades', function (req, res) {
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

    res.setHeader('Content-disposition', 'attachment; filename=trades.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];
        toSend += row.uid + "," + row.symbol + "," + row.expiry_month + ","
                  + row.expiry_year + "," + row.lots + "," + row.price + ","
                  + row.type + "," + row.traderID + "," + row.transactionTime + "\n";
    }
    res.send(toSend);

    connection.end();
  });
});

//Write Aggregate Position to CSV File
app.get('/CSVAggregate', function (req, res) {
  var connection = mysql.createConnection(
    {
      host     : '104.131.22.150',
      user     : 'rrp',
      password : 'rrp',
      database : 'financial',
    }
  );
 
  connection.connect();
   
  var queryString = "Select symbol, expiry_month, expiry_year, sum(lots) as lots FROM"  +
    ' ((SELECT symbol, IF(type="Buy", sum(lots), -1 * sum(lots)) as lots, expiry_year, ' +
    "expiry_month, type FROM Trades GROUP BY symbol, expiry_year, expiry_month, type) " +
    "as summedTrades) GROUP BY symbol, expiry_year, expiry_month;";
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=aggregate.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
      row = rows[row];
      toSend += row.symbol + "," + row.expiry_month + "," + row.expiry_year + "," 
                + row.lots + "\n"; 
    }
    res.send(toSend);

    connection.end();
  });
});

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
