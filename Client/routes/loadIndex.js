var mysql = require('mysql');
var amqp = require('amqplib/callback_api');

global.messages = "";

// Render the index page with a assert message
//@res - response object to send the index page to
//@message - message to show in the assert box
function loadIndexWithMessage(res, message, trg)
{

    var connection = mysql.createConnection(
    {
      host     : '104.131.22.150',
      user     : 'rrp',
      password : 'rrp',
      database : 'financial',
    }
  );
 
  connection.connect();
   
  var queryString = 'SELECT * FROM Trader';

  var traders = [];
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    for (row in rows){
        row = rows[row];
        traders.push(row.id + " - " + row.first_name + " " + row.last_name);
    }

    var fillStr = "";
    if(trg != undefined){
      for(i = 0; i < trg.length; i++){
        fillStr += "<p class='msgs'>"+trg[i]+"</p><br/>";
      }
    }
    console.log("fillStr" + fillStr);

    amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
      conn.createChannel(function(err, ch) {
        var q = 'requestConsent';
        ch.prefetch(1);
        ch.assertQueue(q, {durable: false}, function(err, ok){
          if (err) throw err;
          console.log("MessageCount:" + ok.messageCount);
          if (ok.messageCount > 0){
            console.log("MessageCount2:" + ok.messageCount);
            ch.consume(q, function(msg) {
              var swapId = msg.content.toString(); //Parse out the swapId from Message - Priscilla
              queryString = "SELECT * from Swaps where swapId=" + swapId + ";";
              console.log(queryString);
              connection.query(queryString, function(err, rows, fields) {
                if (err) throw err;
                var swapMessage = "Request Consent for Swap " + rows[0].swapId + "<br> Trader: " + rows[0].uid + "<br>Start: " + rows[0].start 
                  + "<br>End: " + rows[0].termination + "<br>Floating Rate: " + rows[0].floatingRate + "<br>\t Paid by: " + rows[0].fixedPayer + 
                  "<br>Fixed Rate: " + rows[0].fixedRate + "<br>\tPaid by: " + rows[0].floatPayer + "<br>Spread: " + rows[0].spread;
                res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
                  title: 'Trade Capturer',
                  alertScript: message,
                  traderScript: JSON.stringify(traders),
                  fills: fillStr,
                  swapMessage: swapMessage,
                  swapId: rows[0].swapId});
                ch.ack(msg);
                ch.close();
                return;
              });
            });
          }
          else {
            ch.assertQueue("clearingReply", {durable: false}, function(err, ok2){
              if (err) throw err;
              console.log("Message Count 2:" + ok2.messageCount);
              if (ok2.messageCount > 0){
                ch.consume("clearingReply", function(msg2) {
                  var swapId = 1; //Parse out the swapID from msg2 - Priscilla
                  var cleared = true; //Parse out if swap was cleared (true) or denied (false) - Priscilla
                  queryString = "SELECT * from Swaps where swapId=" + swapId + ";";
                  console.log("Rona2: " + queryString);
                  connection.query(queryString, function(err, rows, fields) {
                    if (err) throw err;
                    var swapMessage2 = "Clearing Confirmed for Swap " + rows[0].swapId + "\n Trader: " + rows[0].uid + "\nStart: " + rows[0].start 
                      + "\nEnd: " + rows[0].termination + "\nFloating Rate: " + rows[0].floatingRate + "\n\t Paid by: " + rows[0].fixedPayer + 
                      "\nFixed Rate: " + rows[0].fixedRate + "\n\tPaid by: " + rows[0].floatPayer + "\nSpread: " + rows[0].spread;
                    if (!cleared){
                      swapMessage2 = "Clearing Refused for Swap " + rows[0].swapId + "\n Trader: " + rows[0].uid + "\nStart: " + rows[0].start 
                        + "\nEnd: " + rows[0].termination + "\nFloating Rate: " + rows[0].floatingRate + "\n\t Paid by: " + rows[0].fixedPayer + 
                        "\nFixed Rate: " + rows[0].fixedRate + "\n\tPaid by: " + rows[0].floatPayer + "\nSpread: " + rows[0].spread;
                    }
                    console.log(swapMessage2);
                    res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
                      title: 'Trade Capturer',
                      alertScript: message,
                      traderScript: JSON.stringify(traders),
                      fills: fillStr,
                      swapMessage2: swapMessage2});
                    ch.ack(msg2);
                    ch.close();
                    return;
                  });
                });
              }
              else{
                res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
                title: 'Trade Capturer',
                alertScript: message,
                traderScript: JSON.stringify(traders),
                fills: fillStr });
                ch.close();
                return;
              }
            });
          }
        });
      });
    });
  });
}

module.exports = {
  loadIndexWithMessage : function (res, message, m) { 
                            loadIndexWithMessage(res, message, m);
                          }
};