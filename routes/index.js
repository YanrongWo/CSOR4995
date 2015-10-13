var express = require('express');
var moment = require('moment');
var mysql = require('mysql');
var loadIndex = require('./loadIndex');

var router = express.Router();

//@Summary: Load the home page with no alert message
//@Triggered: GET request sent to domain/
router.get('/', function(req, res, next) {
    loadIndex.loadIndexWithMessage(res, '');
});

//@Summary: Inserts value from form on home page into database
//@Triggered: POST request sent from domain/
router.post('/', function (req, res) {
  //Values from field and date recieved
  var utcdatetime = moment.utc().format('YYYY-MM-DD HH:mm:ss');
  var symbol = req.body.symbol;
  var expiry = req.body.expiry;
  var lots = req.body.lots;
  var price = req.body.price;
  var type = req.body.transType;
  var traderID = req.body.trader;

  //Check if form is completely filled
  if (!symbol || !expiry || !lots || !price || !type || !traderID){
    loadIndex.loadIndexWithMessage(res, 'All values must be filled in.')
    return;
  }

  // Check expiry date
  var romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];
  var expiry_regex = /([A-Za-z]+)\s*(\d\d)/g;
  var expiry_match = expiry_regex.exec(expiry);
  var expiry_month = ""
  var expiry_year = ""
  if (expiry_match)
  {
    expiry_month = expiry_match[1].toUpperCase();
    expiry_year  = expiry_match[2];
    month = romanNumbers.indexOf(expiry_month) == -1 ?  months.indexOf(expiry_month) + 1: romanNumbers.indexOf(expiry_month) + 1;
    if (romanNumbers.indexOf(expiry_month) == -1 && months.indexOf(expiry_month) == -1) {
      loadIndex.loadIndexWithMessage(res,'Invalid expiry value1.');
      return;
    }
    var d = new Date();
    if (parseInt(d.getFullYear().toString().substr(2,2)) > parseInt(expiry_year)){
      loadIndex.loadIndexWithMessage(res, 'Invalid expiry value2.');
      return;
    }

  }
  else {
    loadIndex.loadIndexWithMessage(res, 'Invalid expiry value3.');
    return;
  }

  // Check if price is a number
  if (isNaN(price)){
    loadIndex.loadIndexWithMessage(res, 'In valid price value.');
    return;
  }

  //Connect to database
  var connection = mysql.createConnection({
    host     : '104.131.22.150',
    user     : 'rrp',
    password : 'rrp',
    database: 'financial'
  });

  connection.connect();

  connection.query('INSERT INTO Trades VALUES (NULL, "' + symbol + '","' + expiry_month + '","' + expiry_year + '","' + lots + '","' +
    price + '","' + type + '","' + traderID + '","' + utcdatetime + '");', function(err, rows, fields) {
      if (err){
        loadIndex.loadIndexWithMessage(res, 'Error accessing database. Try again later.');
        throw err;
      } 
      connection.end();
      //Show confirmation 
      loadIndex.loadIndexWithMessage(res, 'Trade captured!');
  });
});

module.exports = router;