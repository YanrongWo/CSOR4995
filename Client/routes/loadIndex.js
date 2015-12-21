var mysql = require('mysql');

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
    res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
    title: 'Trade Capturer',
    alertScript: message,
    traderScript: JSON.stringify(traders),
    fills: fillStr });

    connection.end();

  });
}


// function loadIndexWithConfirm(res, alert){
//   res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
//     title: 'Trade Capturer',
//     alertScript: message,
//     traderScript: JSON.stringify(traders),
//     fills: fillStr });
// }
module.exports = {
  loadIndexWithMessage : function (res, message, m) { 
                            loadIndexWithMessage(res, message, m);
                          }
};