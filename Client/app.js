var express = require('express');
var moment = require('moment');
var path = require('path');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var mysql = require('mysql');
var http = require("http");
var loadIndex = require('./routes/loadIndex');
var routes = require('./routes/index');
var users = require('./routes/users');

var amqp = require('amqplib/callback_api');

var app = express();

var today = new Date();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, 'public', 'logo.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

//@Summary: Inserts value from form on interest Rate Swap page into database
//@Triggered: POST request sent from domain/interestRateSwap
app.post('/interestRateSwap', function (req, res) {
  // Values from field and date received
  var utcdatetime = moment.utc().format('YYYY-MM-DD HH:mm:ss');
  var startdate = req.body.startDate;
  var terminationdate = req.body.terminationDate;
  var floating = req.body.floatingRate;
  var spread = req.body.spreadOnFloatingRate;
  var fixed = req.body.fixedRate;
  var traderID = req.body.trader;
  var whopaysfixed = req.body.whoPaysFixed;
  var whopaysfloat = req.body.whoPaysFloat;
  var status = 'ongoing';

  //Check if form is completely filled
  if (!startdate || !terminationdate || !floating ||  !spread || !fixed || !whopaysfixed || !whopaysfloat){
    loadIndex.loadIndexWithMessage(res, 'All values must be filled in.', "")
    return;
  }

  var queryString = "INSERT INTO Swaps VALUES ('" + startdate + "','" +  terminationdate 
    + "','" + floating + "','" + spread + "','" + fixed + "','" + whopaysfixed + "','" 
    + whopaysfloat + "','" + traderID + "','" + utcdatetime + "','" + status + "');";

  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    loadIndex.loadIndexWithMessage(res, 'Interest Rate Swap Captured!', "")
  });
});

var connection = mysql.createConnection(
  {
    host     : '104.131.22.150',
    user     : 'rrp',
    password : 'rrp',
    database : 'financial',
  }
);

connection.connect();

//@Summary: Redirect to home page if not post request
//@Triggered: GET request sent to domain/newUser
app.get('/newUser', function(req, res){
  res.redirect('/');
});

//@Summary: Adds a new user to Trader table
//@Triggered: POST request sent to domain/newUser
app.post('/newUser', function(req, res){

  var first = req.body.first;
  var last = req.body.last;
  // Make sure all values filled in
  if (!first || !last)
  {
      loadIndex.loadIndexWithMessage(res, "Must provide both first and last name.", "")
  }

  var queryString = 'INSERT INTO Trader VALUES (NULL,"' + first + '", "' + last + '");';

  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    //Get ID for this new user and sent it as an alert
    queryString = "SELECT LAST_INSERT_ID();"
    connection.query(queryString, function(err, rows, fields) {
      if (err) throw err;
      loadIndex.loadIndexWithMessage(res, 'Success! Your userID is ' + rows[0]['LAST_INSERT_ID()'] + ".", "");
    });
  });
});

//@Summary: Write Trades to CSV File
//@Triggered: GET request sent to domain/CSVTrades
app.get('/CSVTrades', function (req, res) {
   
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
        for (field in fields){
          field = fields[field].name
          toSend += row[field] + ",";
        }
        toSend = toSend.substring(0, toSend.length - 1) + "\n";
    }
    res.send(toSend);

  });
});

    


function getMarketPrice(symbol) {
  amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
  conn.createChannel(function(err, ch) {
    if (err)
      console.log(err);
    var q = 'Exchange';
    var msg = "MARKETPRICE: "+symbol;
    ch.assertQueue(q, {durable: false});
    receiveMarketPrice(symbol);
    ch.sendToQueue(q, new Buffer(msg), {persistent: true});
    console.log("Exchange market data request: " + symbol);
  });
  setTimeout(function() { conn.close(); }, 500);
  });
}

function receiveMarketPrice(symbol) {
  var messages = ""
  amqp.connect('amqp://test:test@104.131.22.150/', function(err, conn) {
  conn.createChannel(function(err, ch) {
    if (err)
      console.log(err);
    var ex = 'MarketPrice';

    ch.assertExchange(ex, 'topic', {durable: true});

    ch.assertQueue('', {exclusive: true}, function(err, q) {
      ch.bindQueue(q.queue, ex, symbol );

      ch.consume(q.queue, function(msg) {
        msg = msg.content.toString();
        console.log(symbol + " market Price received: "+msg);
        
        //send msg price to PnL calculation
        marketprices[symbol] = parseInt(msg);

        //send msg to daily trades


      }, {noAck: true});
    });
  });
  });
}

function getDate(date) {
	var dd = date.getDate();
	var mm = date.getMonth()+1;
	var yyyy = date.getFullYear();

	if(dd < 10) {
		dd = '0' + dd
	}
	if(mm < 10) {
		mm = '0' + mm
	}

	date = mm+'/'+dd+'/'+yyyy;
	return date;
}


//@Summary: Write daily trades to CSV File
//@Triggered: GET request sent to domain/CSVDailyTrades
app.get('/CSVDailyTrades', function (req, res) {
   
  // Find the Trades associated to the fills from today
  var queryString = 'SELECT * FROM Trades, Fills WHERE Fills.tradeID = Trades.uid '+
        'AND DATE(Fills.fillTime) in (SELECT eod from EOD) AND DATE(Trades.transactionTime) in '+ 
        '(SELECT eod from EOD);';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=dailytrades.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];

          var my_price = null;
        	// Find price to display 
        	if (row.type == "Limit") {
            // Set price as Client inputed price if type is Limit
            my_price = row.price;
        	}
          // Market/ Pegged, price is null 
        	else{
        		my_price = null;
        	}
          // Values that are displayed in the csv
	        toSend += row.uid + "," + row.symbol + "," + row.expiry_month + ","
	                  + row.expiry_year + "," + row.lots + "," + my_price + ","
	                  + row.side + "," + row.traderID + "," + row.transactionTime + "," 
	                  + row.type + "," + row.uid + "," + row.lots + "," + row.fillPrice + "," 
                    + row.fillTime + "," + row.TradeID +"\n";
        }

    res.send(toSend);

  });
});

var marketprices = {};
//@Summary: Write PnL By Trades to CSV File
//@Triggered: GET request sent to domain/CSVPL
app.get('/CSVPL', function (req, res) {
	var pltype = req.query["pltype"];
	if(pltype !== "trades" && pltype !== "trader" && pltype !== "product") {
		res.send("ERROR");
		return 0;
	}
   
  var queryString = 'SELECT * FROM Trades';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

			marketprices = {};
      for(row in rows) {
				row = rows[row];
				var sym = row["symbol"];
				if(!(sym in marketprices)) {
					marketprices[sym] = -1;
					getMarketPrice(sym);
				}
			}
		setTimeout(function() {generateCSVPL(pltype, res, rows); }, 500);
  });
});

function generateCSVPL(pltype, res, trades) {
	for(var sym in marketprices) {
		if(marketprices[sym] === -1) {
			setTimeout(function() {generateCSVPL(pltype, res, trades); }, 500);
			return 0;
		}
	}

	queryString = 'SELECT * FROM Fills';
	connection.query(queryString, function(err2, fills, fields) {  
		if (err2) throw err2;

		var tradesprofit = {};
		var profit = 0;

		for(var trade in trades) {
			trade = trades[trade];
			var total = 0;
			var fillnum = 0;
			for(var fill in fills) {
				fill = fills[fill];
				if(fill["tradeID"] === trade["uid"]) {
					total += fill["fillPrice"]*fill["lots"];
					fillnum += fill["lots"];
				}
			}
			if(fillnum > 0) {
				if(trade["side"] === "Sell") {
					console.log("yoyo"+total);
					tradesprofit[trade["uid"]] = total;
					profit += total;
				}
				if(trade["side"] === "Buy") {
					var currentval = fillnum * marketprices[trade["symbol"]];
					tradesprofit[trade["uid"]] = total - currentval;
					profit += total - currentval;
				}
			}
		}

		//setup CSV
    res.setHeader('Content-disposition', 'attachment; filename=pnl'+pltype+'.csv');
    res.setHeader('Content-type', 'text/csv');
		var toSend = "";


		if(pltype === "trades") {
			toSend += "TradeID,Profit\n"
			for(var row in tradesprofit) {
				toSend += row+","+tradesprofit[row]+"\n";
			}
			res.send(toSend);
		}
		if(pltype === "trader") {
			var tradersprofit = {}; 
			for(var trade in trades) {
				trade = trades[trade];
				var p = tradesprofit[trade["uid"]];
				var traderID = trade["traderID"];
				if(trade["uid"] in tradesprofit) {
					if(traderID in tradersprofit) {
						tradersprofit[traderID] += tradesprofit[trade["uid"]];
					}
					else {
						tradersprofit[traderID] = tradesprofit[trade["uid"]];
					}
				}
			}

			toSend += "TraderID,Profit\n";
			for(var row in tradersprofit) {
				toSend += row+","+tradersprofit[row]+"\n";
			}
			console.log(tradesprofit);
			res.send(toSend);
		}
		if(pltype === "product") {
			var productprofit = {};
			for(var trade in trades) {
				trade = trades[trade];
				var sym = trade["symbol"];
				var expm = trade["expiry_month"];
				var expy = trade["expiry_year"];
				var key = sym+"-"+expm+"-"+expy;
				if(trade["uid"] in tradesprofit) {
					if(key in productprofit) {
						productprofit[key] += tradesprofit[trade["uid"]];
					}
					else {
						productprofit[key] = tradesprofit[trade["uid"]];
					}
				}
			}
	
			toSend += "symbol,expiry_month,expiry_year,Profit\n";
			for(var row in productprofit) {
				var prod = row.split("-");
				toSend += prod[0]+","+prod[1]+","+prod[2]+","+productprofit[row]+"\n";
			}
			res.send(toSend);
		}
	});
}


//@Summary: Write Aggregate Position to CSV File
//@Triggered: GET request sent to domain/CSVAggregate
app.get('/CSVAggregate', function (req, res) {
   
  var queryString = 'SELECT * FROM Trades';
  connection.query(queryString, function(err, trades, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=aggregate.csv');
    res.setHeader('Content-type', 'text/csv');
		queryString = 'SELECT * FROM Fills';

  	connection.query(queryString, function(err, fills, fields2) {
	    if (err) throw err;

			var tradesvalue = {};
			var tradeslots = {};

			for(var trade in trades) {
				trade = trades[trade];
				var total = 0;
				var fillnum = 0;
				for(var fill in fills) {
					fill = fills[fill];
					if(fill["tradeID"] === trade["uid"]) {
						total += fill["fillPrice"]*fill["lots"];
						fillnum += fill["lots"];
					}
				}
				if(fillnum > 0) {
					if(trade["side"] === "Sell") {
						tradesvalue[trade["uid"]] = total;
						tradeslots[trade["uid"]] = -1*fillnum;
					}
					if(trade["side"] === "Buy") {
						tradesvalue[trade["uid"]] = -1*total;
						tradeslots[trade["uid"]] = fillnum;
					}
				}
			}
			console.log(tradesvalue);

			//by product
			var productvalue = {};
			var productlots = {};
			for(var trade in trades) {
				trade = trades[trade];
				var sym = trade["symbol"];
				var expm = trade["expiry_month"];
				var expy = trade["expiry_year"];
				var key = sym+"-"+expm+"-"+expy;
				if(trade["uid"] in tradesvalue) {
					if(key in productvalue) {
						productvalue[key] += tradesvalue[trade["uid"]];
						productlots[key] += tradeslots[trade["uid"]];
					}
					else {
						productvalue[key] = tradesvalue[trade["uid"]];
						productlots[key] = tradeslots[trade["uid"]];
					}
				}
			}
	
			var toSend = "symbol,expiry_month,expiry_year,lots_owed,value_owed\n";
			for(var row in productlots) {
				var prod = row.split("-");
				toSend += prod[0]+","+prod[1]+","+prod[2]+","+productlots[row]+","+productvalue[row]+"\n";
			}
			res.send(toSend);
		});

  });
});


//@Summary: Write Swaps to CSV File
//@Triggered: GET request sent to domain/CSVSwaps
app.get('/CSVSwaps', function (req, res) {

  var queryString = 'SELECT * FROM Swaps';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=swaps.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];
        toSend += row.start + "," + row.termination + "," + row.floatingRate + ","
                  + row.spread + "," + row.fixedRate + "," + row.fixedPayer + ","
                  + row.floatPayer + "," + row.uid + "," + row.transactionTime + "," 
                  + row.status + "\n";
    }
    res.send(toSend);

  });

});

//@Summary: Write daily Swaps to CSV File
//@Triggered: GET request sent to domain/CSVDailySwaps
app.get('/CSVDailySwaps', function (req, res) {

  // Find the Trades associated to the fills from today
  var queryString = 'SELECT * FROM Swaps WHERE DATE(transactionTime) in (SELECT eod from EOD);';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=dailyswaps.csv');
    res.setHeader('Content-type', 'text/csv');

    var utcdate = moment.utc().format('YYYY-MM-DD');
    console.log("transdate: ", utcdate)
    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];
        swapdate = row.transactionTime.getFullYear() + "-" 
                  + parseFloat(row.transactionTime.getMonth() + 1 )+ "-" 
                  + swapday(row.transactionTime);
        console.log("transdate: ", row.transactionTime)
        console.log("Date Format: ", swapdate)
        if (utcdate == swapdate) {
          toSend += row.start + "," + row.termination + "," + row.floatingRate + ","
                  + row.spread + "," + row.fixedRate + "," + row.fixedPayer + ","
                  + row.floatPayer + "," + row.uid + "," + row.transactionTime + "," 
                  + row.status + "\n";
        }
    }
    res.send(toSend);

  });
});

// Function to change the format of transition date. Used in DailySwaps.
function swapday(time){
  if (time.getDate() < 10) { 
    return '0' + time.getDate()
  }
  else 
    return time.getDate()
}

//@Summary: Write Aggregate Position to CSV File
//@Triggered: GET request sent to domain/CSVAggregateSwaps
app.get('/CSVAggregateSwaps', function (req, res) {
//TODO

  // Find the Trades associated to the fills from today
  var queryString = 'SELECT * FROM Swaps WHERE DATE(termination) in (SELECT eod from EOD);';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

		var toSend = "start,termination,rate_to_receive,rate_to_pay\n";
		for(var row in rows) {
			row = rows[row];
			var floatr = row['floatingRate'] + row['spread'];
			var fixed = row['fixedRate'];
			if(row['floatPayer'] === "Me") {
				toSend += row["start"] + "," + row["termination"] + "," + fixed + "," + floatr + "\n";
			}
			else {
				toSend += row["start"] + "," + row["termination"] + "," + floatr + "," + fixed + "\n";
			}	
		}		
    res.setHeader('Content-disposition', 'attachment; filename=dailyswaps.csv');
    res.setHeader('Content-type', 'text/csv');
		res.send(toSend);
	});

});

//@Summary: Write PnL By Trades to CSV File
//@Triggered: GET request sent to domain/CSVPL
app.get('/CSVPLSwaps', function (req, res) {
  var pltype = req.query["pltype"];
  if(pltype !== "trades" && pltype !== "trader" && pltype !== "product") {
    res.send("ERROR");
    return 0;
  }


  //TODO
});

app.get('/Eod', function(req, res){
  queryString = "Select * from EOD;";
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    var eod = rows[0].eod;
    var daystoAdd = 1;

    daystoAdd = updateDaysPastWeekend(daystoAdd, eod, 1);
    var tomorrow = eod.addDays(daystoAdd);
    var day = tomorrow.getDate();
    var month = tomorrow.getMonth() + 1;
    var year = tomorrow.getFullYear();
    var url = "http://holidayapi.com/v1/holidays?country=US&year=" + year.toString() 
      + "&month=" + month.toString() + "&day=" + day;
    var request = http.get(url, function (response) {  
      var buffer = "", 
          data,
          route;

      response.on("data", function (chunk) {
          buffer += chunk;
      }); 

      response.on("end", function (err) {
        data = JSON.parse(buffer);
        holidays = data.holidays;
        actual_holidays = ["New Year's Day", "Martin Luther King, Jr. Day", "Washington's Birthday", "Good Friday",
          "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas"];
        for (var i in holidays){
          for (var j in actual_holidays){
            if (holidays[i].name == actual_holidays[j]){
              daystoAdd += 1
            }
          }
        }
        daystoAdd = updateDaysPastWeekend(daystoAdd, eod, 1);
        queryString = "UPDATE EOD set eod=(DATE_ADD(eod, INTERVAL " + daystoAdd.toString() + " DAY));"
        connection.query(queryString, function(err, rows, fields) {
          if (err) throw err;
          queryString = "Select * from EOD;";
          connection.query(queryString, function(err, rows, fields) {
            if (err) throw err;
            eod = rows[0].eod;
            updateMaturingTrades(eod);
            updateMaturingSwaps(eod);
            loadIndex.loadIndexWithMessage(res, 'EOD updated to: ' + eod);
          });
        });
      }); 
    }); 
  });
});

function updateMaturingSwaps(eod){
  var month = eod.getMonth() + 1;
  var year = eod.getFullYear();
  var day = eod.getDate();
  var queryString = "update Swaps set status = 'ongoing';";
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;
    queryString = "update Swaps SET status='matured' where (YEAR(termination) < " + year 
      + ") OR (YEAR(termination) = " + year + " and MONTH(termination) < " + month + 
      ") OR (YEAR(termination) = " + year + " and MONTH(termination) = " + month + 
      " and DAY(termination) < " + day + ");";
    connection.query(queryString, function(err, rows, fields) {
      if (err) throw err;
      queryString = "update Swaps SET status='maturing' where (YEAR(termination) = " + 
        year + " and MONTH(termination) = " + month + 
        " and DAY(termination) = " + day + ");";
      connection.query(queryString, function(err, rows, fields) {
        if (err) throw err;
      });
    });
  });
}

function updateMaturingTrades(eod){
  var month = eod.getMonth();
  var year = eod.getFullYear();
  var expireDate = new Date(year, month + 1, 1, 0, 0, 0, 0);
  var daystoAdd = -1;
  daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
  var previous = expireDate.addDays(daystoAdd);
  var day = previous.getDate();
  var month = previous.getMonth() + 1;
  var year = previous.getFullYear();
  var url = "http://holidayapi.com/v1/holidays?country=US&year=" + year.toString() 
    + "&month=" + month.toString() + "&day=" + day;
  var request = http.get(url, function (response) {  
    var buffer = "", 
        data,
        route;

    response.on("data", function (chunk) {
        buffer += chunk;
    }); 

    response.on("end", function (err) {
      data = JSON.parse(buffer);
      holidays = data.holidays;
      var actual_holidays = ["New Year's Day", "Martin Luther King, Jr. Day", "Washington's Birthday", "Good Friday",
        "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas"];
      for (var i in holidays){
        for (var j in actual_holidays){
          if (holidays[i].name == actual_holidays[j]){
            daystoAdd -= 1
          }
        }
      }
      daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
      daystoAdd -= 1;
      daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
      var previous = expireDate.addDays(daystoAdd);
      var day = previous.getDate();
      var month = previous.getMonth() + 1;
      var year = previous.getFullYear();
      var url = "http://holidayapi.com/v1/holidays?country=US&year=" + year.toString() 
        + "&month=" + month.toString() + "&day=" + day;
      var request = http.get(url, function (response) {  
        var buffer = "", 
            data,
            route;

        response.on("data", function (chunk) {
            buffer += chunk;
        }); 

        response.on("end", function (err) {
          data = JSON.parse(buffer);
          holidays = data.holidays;
          actual_holidays = ["New Year's Day", "Martin Luther King, Jr. Day", "Washington's Birthday", "Good Friday",
            "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas"];
          for (var i in holidays){
            for (var j in actual_holidays){
              if (holidays[i].name == actual_holidays[j]){
                daystoAdd -= 1
              }
            }
          }
          daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
          daystoAdd -= 1;
          daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
          var previous = expireDate.addDays(daystoAdd);
          var day = previous.getDate();
          var month = previous.getMonth() + 1;
          var year = previous.getFullYear();
          var url = "http://holidayapi.com/v1/holidays?country=US&year=" + year.toString() 
            + "&month=" + month.toString() + "&day=" + day;
          var request = http.get(url, function (response) {  
            var buffer = "", 
                data,
                route;

            response.on("data", function (chunk) {
                buffer += chunk;
            }); 

            response.on("end", function (err) {
              data = JSON.parse(buffer);
              holidays = data.holidays;
              actual_holidays = ["New Year's Day", "Martin Luther King, Jr. Day", "Washington's Birthday", "Good Friday",
                "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas"];
              for (var i in holidays){
                for (var j in actual_holidays){
                  if (holidays[i].name == actual_holidays[j]){
                    daystoAdd -= 1
                  }
                }
              }
              daystoAdd = updateDaysPastWeekend(daystoAdd, expireDate, -1);
              previous = expireDate.addDays(daystoAdd);
              var queryString = "update Trades set status = 'ongoing';"
              connection.query(queryString, function(err, rows, fields) {
                if (err) throw err;
                queryString = "update Trades set status = 'matured' where (expiry_year < " + 
                  eod.getFullYear().toString().substring(2) + ") OR (expiry_year = " 
                  + eod.getFullYear().toString().substring(2) + " AND expiry_month < "
                  + eod.getMonth() + ");";
                connection.query(queryString, function(err, rows, fields) {
                  if (err) throw err;
                  if (eod.getDate() === previous.getDate()){
                    queryString = "update Trades set status = 'maturing' where (expiry_year = " 
                      + eod.getFullYear().toString().substring(2) + " AND expiry_month = "
                      + eod.getMonth() + ");";
                    connection.query(queryString, function(err, rows, fields) {
                      if (err) throw err;

                    });
                  }
                  else if (eod.getDate() > previous.getDate()){
                    queryString = "update Trades set status = 'matured' where (expiry_year = " 
                      + eod.getFullYear().toString().substring(2) + " AND expiry_month = "
                      + eod.getMonth() + ");";
                    connection.query(queryString, function(err, rows, fields) {
                      if (err) throw err;

                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  });
}

function updateDaysPastWeekend(daystoAdd, currentTime, numDays){
  var isWeekend = true;
  while (isWeekend){
    var newTime = currentTime.addDays(daystoAdd);
    if (newTime.getDay() == 0){
      daystoAdd += numDays;
    }
    else if (newTime.getDay() == 6){
      daystoAdd += numDays;
    }
    else{
      isWeekend = false;
    }
  }
  return daystoAdd;
}

Date.prototype.addDays = function(days)
{
    var dat = new Date(this.valueOf());
    dat.setDate(dat.getDate() + days);
    return dat;
}

app.get('/CSVMaturing', function (req, res) {
  var queryString = 'SELECT * FROM Trades where status="maturing"';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=tradesmaturing.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];
        for (field in fields){
          field = fields[field].name
          toSend += row[field] + ",";
        }
        toSend = toSend.substring(0, toSend.length - 1) + "\n";
    }
    res.send(toSend);
  });
});


//@Summary: Write Swaps to CSV File
//@Triggered: GET request sent to domain/CSVSwaps
app.get('/CSVMaturingSwaps', function (req, res) {

  var queryString = 'SELECT * FROM Swaps where status="maturing"';
   
  connection.query(queryString, function(err, rows, fields) {
    if (err) throw err;

    res.setHeader('Content-disposition', 'attachment; filename=swapsmaturing.csv');
    res.setHeader('Content-type', 'text/csv');

    var toSend = "";
    for (field in fields){
      field = fields[field];
      toSend += field.name + ",";
    }
    toSend = toSend.substring(0, toSend.length - 1) + "\n";
    for (row in rows){
        row = rows[row];
        for (field in fields){
          field = fields[field].name
          toSend += row[field] + ",";
        }
        toSend = toSend.substring(0, toSend.length - 1) + "\n";
    }
    res.send(toSend);

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


process.stdin.resume();//so the program will not close instantly

function exitHandler(options, err) {
    connection.end();
    if (options.cleanup) console.log('Cleaning up');
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));


module.exports = app;
