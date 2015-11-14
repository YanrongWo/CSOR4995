var express = require('express');
var moment = require('moment');
var mysql = require('mysql');
var loadIndex = require('./loadIndex');
var amqp = require('amqplib/callback_api');
var Fix = require('../node_modules/fix/fix.js');
var cmq = require('../node_modules/clientmq.js');
var dateFormat = require('dateformat');
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

          // Generate Values for OrderType 
          function order_type_value(type) {
            if (type == "Market") {
              return 1;
            }
            if (type == "Limit") {
              return 2;
            }
            if (type =="Pegged"){
              return "P";
            }
          }
          console.log(" My order type in index.js: ", order_type_value(type)); 

          // Generate Values for side
          function side_value(side) {
            if (side == "Buy") {
              return 1
            }
            else {
              return 2
            }
          }

          //Get month in MM format
          function getMonthFromString(mon){
            return new Date(Date.parse(mon +" 1, 2012")).getMonth()+1
          }

          //Generate maturity month and year in YYYYMM format
          function format_year_month(year, month) {
            var yyyy = "20" + expiry_year;
            var mm = getMonthFromString(expiry_month);
            if(mm < 10) {
              mm = '0' + mm
            }
            return yyyy + mm 
          }


          if (side == "Buy"){
            side = 1;
          } else if (side == "Sell") {
            side = 0;
          }
          // Generate Fix message
          var fix_message;  

          // If Fix message is Limit, generate this: 
          if (order_type_value(type) == 2) {
            fix_message = Fix.message({
              TransactTime: utcdatetime,
              SendingTime: date.getTime(),
              OrdType: order_type_value(type),
              Symbol: symbol,
              MaturityMonthYear: format_year_month(expiry_year, expiry_month),
              OrderQty: lots,
              Price: price,
              Side: side_value(side),
              SenderCompID: traderID,
              OrderID: myUid
            }, true);
          }

          // If Fix messag is pegged, generate this: 
          else {
            fix_message = Fix.message({
              TransactTime: utcdatetime,
              SendingTime: date.getTime(),
              OrdType: order_type_value(type),
              Symbol: symbol,
              MaturityMonthYear: format_year_month(expiry_year, expiry_month),
              OrderQty: lots,
              Side: side_value(side),
              SenderCompID: traderID,
              OrderID: myUid
            }, true);
          }

          console.log("My order:", Fix.read(fix_message).OrdType);
          console.log(fix_message);

          conn.createChannel(function(err, ch) {
            if (err)
              console.log(err);
            var q = 'Exchange';
            var msg =  fix_message;
            ch.assertQueue(q, {durable: false});
            recieveFills(myUid, res, req);
            ch.sendToQueue(q, new Buffer(msg), {persistent: true});
            //loadIndex.loadIndexWithMessage(res, 'Trades captured!', []);
            console.log('Sent to Exchange');
          });
          setTimeout(function() { conn.close(); }, 500);
        });
        //Show confirmation 
        connection.end();
    });
  });
});

/* Recieves fills from the MoM
@param myUid - uid of the trade to listen for
@param res - response to send to the page
@param req - request from the page
*/
function recieveFills(myUid, res, req)
{
  var messages = ""
  amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
  conn.createChannel(function(err, ch) {
    if (err)
      console.log(err);
    var ex = 'Fill';

    ch.assertExchange(ex, 'topic', {durable: true});

    var messageQueue = cmq.getClientMQ(res, 
      function(fix_obj){
        console.log("I work");
        var connection = mysql.createConnection(
        {
          host     : '104.131.22.150',
          user     : 'rrp',
          password : 'rrp',
          database : 'financial',
        }
      );
     
      connection.connect();
      var date = dateFormat(new Date(parseInt(fix_obj.TransactTime)), "isoDateTime");
      var queryString = 'INSERT INTO Fills(lots, fillPrice, fillTime, tradeID)' +
        ' VALUES('+fix_obj.OrderQty+', '+fix_obj.Price+', "'+date+'", '+myUid+');';
       console.log(queryString);
       if(fix_obj.OrderQty > 0){
          connection.query(queryString, function(err, rows, fields) {
            console.log(err);
          });
        }

      },
      function(res, m){
      }
    );

    var hold = 1;
    ch.assertQueue('', {exclusive: true}, function(err, q) {
      console.log(' [*] Waiting for logs. To exit press CTRL+C');
      console.log(myUid + ".");
      ch.bindQueue(q.queue, ex, String(myUid) );

      var num_of_fills = 0;
      var num_of_fills_from_exchange = 0;

      ch.consume(q.queue, function(msg) {
        console.log(" [x] %s:'%s'", ex, msg.content.toString());
        fix_str = msg.content.toString().replace(/ /g, "\x01");
        fix_message = Fix.read(fix_str);

        if (fix_message.NumOfFills != undefined ) {
          fix_length = fix_message.NumOfFills;
          console.log("calculated number of fills: ", fix_length);
          num_of_fills_from_exchange = fix_length;
          messageQueue.setCapacity(fix_length);
        }

        else {
          console.log("Printing message: ", fix_message);
          if (fix_message.OrdType = 1){
            messageQueue.addMessage(fix_message, "Number of lots Purchased: " + fix_message.OrderQty +
            ", Price purchased at: " + fix_message.Price + ", Time purchased at: " + fix_message.TransactTime);
          }
          else {
            console.log("I am here")

            messageQueue.addMessage("Number of lots Purchased: " + fix_message.OrderQty);
          }
  
        }
      
      }, { noAck: true });
        
    });
  });
});


}
module.exports = router;
