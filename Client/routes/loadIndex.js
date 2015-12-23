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

    //Check for any request consent messages in queue
    amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
      conn.createChannel(function(err, ch) {
        var q = 'requestConsent';
        ch.prefetch(1);
        ch.assertQueue(q, {durable: true}, function(err, ok){
          if (err) throw err;
          if (ok.messageCount > 0){
            ch.consume(q, function(msg) { // requestConsent message
              var msgContent = msg.content.toString();
              i_swapid_start = msgContent.indexOf('client_trade_id') + 17;
              i_swapid_end = msgContent.indexOf('</tradeId>');
              swapId = msgContent.substring(i_swapid_start, i_swapid_end);
              queryString = "SELECT * from Swaps where swapId=" + swapId + ";";
              connection.query(queryString, function(err, rows, fields) {
                if (err) throw err;
                var swapMessage = "Request Consent for Swap " + rows[0].swapId + "<br> Trader: " + rows[0].uid + "<br/>Notional Amount: " + rows[0].amount + "<br>Start: " + rows[0].start 
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
            //Check for any clearing confirmed/refused messages in queue
            ch.assertQueue("clearingReply", {durable: true}, function(err, ok2){
              if (err) throw err;
              if (ok2.messageCount > 0){
                ch.consume("clearingReply", function(msg2) { //clearing refused/confirmed mesage
                  var msgContent = msg2.content.toString();
                  i_swapid_start = msgContent.indexOf('client_trade_id') + 17;
                  i_swapid_end = msgContent.indexOf('</tradeId>');
                  var swapId = msgContent.substring(i_swapid_start, i_swapid_end);
                  var cleared = true;
                  var clearing = "cleared";
                  if (msg2.content.toString().indexOf("clearingRefused") >= 0){
                    cleared = false;
                  }
                  queryString = "SELECT * from Swaps where swapId=" + swapId + ";";
                  connection.query(queryString, function(err, rows, fields) {
                    if (err) throw err;
                    var swapMessage2 = "Clearing Confirmed for Swap " + rows[0].swapId + "<br/>Trader: " + rows[0].uid + "<br/>Notional Amount: " + rows[0].amount + "<br/>Start: " + rows[0].start 
                      + "<br/>End: " + rows[0].termination + "<br/>Floating Rate: " + rows[0].floatingRate + "<br/>\t     Paid by: " + rows[0].fixedPayer + 
                      "<br/>Fixed Rate: " + rows[0].fixedRate + "<br/>\t    Paid by: " + rows[0].floatPayer + "<br/>Spread: " + rows[0].spread;
                    if (!cleared){
                      swapMessage2 = "Clearing Refused for Swap " + rows[0].swapId + "<br/>Trader: " + rows[0].uid + "<br/>Notional Amount: " + rows[0].amount +"<br/>Start: " + rows[0].start 
                        + "<br/>End: " + rows[0].termination + "<br/>Floating Rate: " + rows[0].floatingRate + "<br/>\t    Paid by: " + rows[0].fixedPayer + 
                        "<br/>Fixed Rate: " + rows[0].fixedRate + "<br/>\t    Paid by: " + rows[0].floatPayer + "<br/>Spread: " + rows[0].spread;
                      clearing = "refused";
                    }
                    queryString = "Update Swaps where swapId=" + swapId + " set clearing='" + clearing +"';";
                    connection.query(queryString, function(err, rows, fields) {
                    });
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
                //No messages, so render normally
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