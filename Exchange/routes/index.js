var express = require('express');
var router = express.Router();
var www = require('./../bin/www');
/* GET home page. */
router.get('/', function(req, res, next) {
  	res.render('index', { trades: www.recieved_trades});
});

module.exports = router;
