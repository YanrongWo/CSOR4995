var express = require('express');
var moment = require('moment');
var mysql = require('mysql');
var loadIndex = require('./loadIndex');
var amqp = require('amqplib/callback_api');
var Fix = require('../node_modules/fix/fix.js');
var cmq = require('../node_modules/clientmq.js')
var router = express.Router();

var myUid;

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
  var type = req.body.transType;
  var symbol = req.body.symbol;
  var expiry = req.body.expiry;
  var lots = req.body.lots;
  var price = req.body.price;
  var side = req.body.transSide;
  var traderID = req.body.trader;
  var date = new Date();




  //Check if form is completely filled
  if (!symbol || !expiry || !lots ||  !side || !traderID || !type){
    loadIndex.loadIndexWithMessage(res, 'All values must be filled in.', "")
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
      loadIndex.loadIndexWithMessage(res,'Invalid expiry value.', "");
      return;
    }
    var d = new Date();
    if (parseInt(d.getFullYear().toString().substr(2,2)) > parseInt(expiry_year)){
      loadIndex.loadIndexWithMessage(res, 'Invalid expiry value.', "");
      return;
    }

  }
  else {
    loadIndex.loadIndexWithMessage(res, 'Invalid expiry value.', "");
    return;
  }

  if (type == "Limit" && !price)
  {
    loadIndex.loadIndexWithMessage(res,'Must fill in limit price on limit orders.', "");
    return;
  }
  if (type != "Limit")
  {
    price = null;
  }
  // Check if price is a number
  if (isNaN(price)){
    loadIndex.loadIndexWithMessage(res, 'In valid price value.', "");
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

  //Insert into trade database
  connection.query('INSERT INTO Trades VALUES (NULL, "' + symbol + '","' + expiry_month + '","' + expiry_year + '","' + lots + '","' +
    price + '","' + side + '","' + traderID + '","' + utcdatetime + '","' + type + '");', function(err, rows, fields) {
      if (err){
        loadIndex.loadIndexWithMessage(res, 'Error accessing database. Try again later.', "");
      } 
        //Get uid of trade
        queryString = "SELECT LAST_INSERT_ID();"
            connection.query(queryString, function(err, rows, fields) {
              if (err) throw err;
              myUid = rows[0]['LAST_INSERT_ID()'];
            
        //Send message over MoM
        amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
          if (err)
          {
            var query = 'DELETE FROM Trades VALUES WHERE uid = "' + myUid + '"';
            connection.query(queryString, function(err, rows, fields) {
              if (err) throw err;
              connection.end();
              loadIndex.loadIndexWithMessage(res, 'Error accessing MoM. Try again later.', "");
              return;
            });
          }

            // Generate Fix message
          var fix_message = Fix.message({
            TransactTime: utcdatetime,
            SendingTime: date.getTime(),
            OrdType: type,
            Symbol: symbol,
            MaturityMonthYear: expiry_month + expiry_year,
            OrderQty: lots,
            Price: price,
            Side: side,
            SenderCompID: traderID,
            OrderID: myUid
          }, true);

          console.log(fix_message);

          conn.createChannel(function(err, ch) {
            if (err)
              console.log(err);
            var q = 'Exchange';
            var msg =  fix_message;
            ch.assertQueue(q, {durable: false});
            recieveFills(myUid, res, req);
            ch.sendToQueue(q, new Buffer(msg), {persistent: true});
            console.log('Sent to Exchange');
          });
          setTimeout(function() { conn.close(); }, 500);
        });
        //Show confirmation 
        connection.end();
    });
  });
});

function recieveFills(myUid, res, req)
{
  var messages = ""
  amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
  conn.createChannel(function(err, ch) {
    if (err)
      console.log(err);
    var ex = 'Fill';

    ch.assertExchange(ex, 'topic', {durable: true});

    var messageQueue = cmq.getClientMQ(res, function(res, m){
      loadIndex.loadIndexWithMessage(res, 'Trades captured!', m);
    });

    var hold = 1;
    ch.assertQueue('', {exclusive: true}, function(err, q) {
      console.log(' [*] Waiting for logs. To exit press CTRL+C');
      console.log(myUid + ".");
      ch.bindQueue(q.queue, ex, String(myUid) );

      var num_of_fills = 0;
      var num_of_fills_from_exchange = 0;

      ch.consume(q.queue, function(msg) {
        console.log(" [x] %s:'%s'", ex, msg.content.toString());
        fix_message = Fix.read(msg.content.toString());

        if (fix_message.NumOfFills != undefined ) {
          fix_length = fix_message.NumOfFills.length
          var actual_num_fix = fix_message.NumOfFills.slice(0, fix_length - 2);
          console.log("length", actual_num_fix);
          num_of_fills_from_exchange = actual_num_fix;
          messageQueue.setCapacity(actual_num_fix);
        }

        else {
          messageQueue.addMessage("Number of lots Purchased: " + fix_message.OrderQty);
        }
      
      }, { noAck: true });
        
    });
  });
});


}
module.exports = router;
