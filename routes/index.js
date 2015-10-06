var express = require('express');
var moment = require('moment');
var fs = require('fs');
var csv = require('csv-stringify');
var mysql = require('mysql');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
  	title: 'Trade Capturer',
  	alertScript: ''});
});

//Post function on front page
router.post('/', function (req, res) {
  //Values from field and date recieved
  var utcdatetime = moment.utc().format('YYYY-MM-DD HH:mm:ss');
  var symbol = req.body.symbol;
  var expiry = req.body.expiry;
  var lots = req.body.lots;
  var price = req.body.price;
  var type = req.body.transType;
  var trader = req.body.trader;

  //Check if form is completely filled
  if (!symbol || !expiry || !lots || !price || !type || !trader){
    loadIndexWithMessage(res, 'All values must be filled in.')
    return;
  }

  // Check expiry date
  var romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];
  var expiry_regex = /([A-Za-z]+)\s*(\d+)/g;
  var expiry_match = expiry_regex.exec(expiry);
  if (expiry_match)
  {
    expiry_month = expiry_match[1].toUpperCase();
    expiry_day  = expiry_match[2];
    month = romanNumbers.indexOf(expiry_month) == -1 ?  months.indexOf(expiry_month) + 1: romanNumbers.indexOf(expiry_month) + 1;
    if (romanNumbers.indexOf(expiry_month) == -1 && months.indexOf(expiry_month) == -1) {
      loadIndexWithMessage(res,'Invalid expiry value.');
      return;
    }
    if (Date.parse(month + " " + expiry_day + " 2008") == NaN){
      loadIndexWithMessage(res, 'Invalid expiry value.');
      return;
    }

  }
  else {
    loadIndexWithMessage(res, 'Invalid expiry value.');
    return;
  }

  // Check if price is a number
  if (isNaN(price)){
    loadIndexWithMessage(res, 'In valid price value.');
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

  connection.query('INSERT INTO Trades VALUES ("' + symbol + '","' + expiry + '","' + lots + '","' +
    price + '","' + type + '","' + trader + '","' + utcdatetime + '");', function(err, rows, fields) {
    if (err) throw err;
  });

  connection.end();

  //Show confirmation 
  loadIndexWithMessage(res, 'Trade captured!');
});


// Render the index page with a assert message
//@res - response object to send the index page to
//@message - message to show in the assert box
function loadIndexWithMessage(res, message)
{
    res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
    title: 'Trade Capturer',
    alertScript: message});
}

module.exports = router;
