var mysql = require('mysql');

// Render the index page with a assert message
//@res - response object to send the index page to
//@message - message to show in the assert box
function loadIndexWithMessage(res, message)
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

    res.render('index', { cssLink: "<link rel='stylesheet' href='/stylesheets/index.css'/>",
    title: 'Trade Capturer',
    alertScript: message,
    traderScript: JSON.stringify(traders)});

    connection.end();

  });
}

module.exports = {
  loadIndexWithMessage : function (res, message) { 
                            loadIndexWithMessage(res, message);
                          }
};