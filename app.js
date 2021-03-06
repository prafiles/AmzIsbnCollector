var MongoClient = require('mongodb').MongoClient;
var Agent = require('socks5-http-client/lib/Agent');
var request = require('request');
var cheerio = require('cheerio');

var isbnList = null;
var bulkOps = null;
var callbacks = 0;
var testCounter = 0;
var bulkCount = 0;
var bulkTrigger = 1000;
var pageCount = 1;

MongoClient.connect('mongodb://localhost:27017/experiment', function (err, db_exp) {
  if (err) {
    logger('Error in connecting to Mongodb.');
  }
  isbnList = db_exp.collection('amazonIsbnList');
  bulkOps = isbnList.initializeUnorderedBulkOp();
  setInterval(function () {
    main(pageCount++);
  }, 500);
});

function main(pageNo) {
  var options = {
    url: "http://www.amazon.in/gp/aw/s/ref=mh_976389031_is_s_stripbooks?ie=UTF8&n=976389031&page=" + pageNo + "&k=",
    agentClass: Agent,
    agentOptions: {
      socksHost: 'localhost', // Defaults to 'localhost'.
      socksPort: 9050 // Defaults to 1080.
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; U; CPU like Mac OS X; en) AppleWebKit/420+ (KHTML, like Gecko) Version/3.0 Mobile/1A543a Safari/419.3'
    },
  };
  request(options, function (error, response, body) {
    if (error) {
      console.log(error);
    } else if (response.statusCode == 200) {
      pageParser(body, pageNo);
    } else {
      console.log("Store returned with statusCode = " + response.statusCode);
    }
  });
}

function pageParser(body, pageNo) {
  var $ = cheerio.load(body);
  var arr = $('div.toTheEdge.productList');
  console.log("processedPageNo = " + pageNo + " arrLength = " + arr.length);
  arr.each(function (index, val) {
    callbacks++;
    var url = $(val).find('div.productContainer a').attr('href');
    var isbn10 = url.match(/[^0-9]([0-9]{9}[Xx0-9])[^0-9]?/);
    isbn10 = isbn10 && isbn10[1] ? isbn10[1] : null;
    updateIsbnRecords(isbn10, url);
  });
}

function updateIsbnRecords(isbn, url) {
  if (isbn != null) {
    callbacks--;
    testCounter++;
    bulkOps.insert({
      '_id': isbn,
      'isbn': isbn,
      'crawlTime': new Date(),
      'url': url
    });
    bulkCount++;
    //} else {
    //  console.log("processed=" + testCounter);
    //  bulkOps.execute({}, function () {
    //    setInterval(function () {
    //      if (callbacks == 0)
    //        process.exit(0);
    //    }, 1000)
    //  });
  }
  if (bulkCount == bulkTrigger) {
    bulkCount = 0;
    bulkOps.execute({}, function () {
      console.log("Queued Callbacks = " + callbacks);
    });
    bulkOps = isbnList.initializeUnorderedBulkOp();
  }
}
