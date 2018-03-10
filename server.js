let express = require('express');

let multer = require('multer'),
    multerS3 = require('multer-s3');

let AWS = require('aws-sdk');

AWS.config.update({
    accessKeyId: process.env.STICKAR_AWS_ACCESS_KEY,
    secretAccessKey: process.env.STICKAR_AWS_SECRET_KEY,
    region: process.env.STICKAR_AWS_REGIION
});

let app = express(),
    port = process.env.PORT || 3000,
    bodyParser = require('body-parser');

app.use(function(req, res, next){
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(bodyParser.json());

app.listen(3000, function() {
    console.log('Server running on port: ' + port);
});

let ddb = new AWS.DynamoDB({apiVersion: '2012-10-08'});
let dynamodb = new AWS.DynamoDB.DocumentClient();
let s3  = new AWS.S3({ apiVersion: '2006-03-01' });

/* params and upload example.
   let params = {
        Key: 'pexels-photo-248797.jpeg',
        Body: data
    }
let fs = require('fs');

fs.readFile('pexels-photo-248797.jpeg', function(err, data) {
    if (err) { throw err; }
    s3.putObject(params, function(err, data) {
        if (err) {
            console.log(err)
        } else {
            console.log("Successfully uploaded data to myBucket/myKey");
        }
    });
});*/

var upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.STICKAR_AWS_S3_BUCKET,
        key: function (req, file, cb) {
            cb(null, String(Date.now())+file.originalname); //use Date.now() for unique file keys
        }
    })
});

app.get('/', function (req, res) {
    res.send('Server running!');
});

let checkNameParam = function(req, res, next) {
    if (req.query.name) {
        next();
    } else {
        res.send({error: "name parameter in query string missing! Example usage: /upload?name=jlarobello"});
    }
}

let linkToDDB = function(req, res, next) {
    req.files.forEach(function(file) {
        let date = new Date();

        let params = {
            Item:{
                "qrcode": {
                    S: String(Date.now())
                },
                "username": {
                    S: req.query.name
                },
                "s3url": {
                    S: file.location
                },
                "created": {
                    S: date.toISOString()
                }
            },
            ReturnConsumedCapacity: "TOTAL", 
            TableName: process.env.STICKAR_AWS_DDB_TABLE
        }

        ddb.putItem(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
        });
    });

    res.send("Uploaded!");
}

app.post('/upload', [checkNameParam, upload.array('upl',1), linkToDDB]);

app.get('/user/:username', function(req, res) {
    
    let params = {
        TableName: process.env.STICKAR_AWS_DDB_TABLE,
        IndexName: "username-created-index",
        KeyConditionExpression: "username = :username",
        ExpressionAttributeValues: {
            ":username": req.params.username
        },
        ScanIndexForward: true
    }
    
    dynamodb.query(params, function(err, data) {
        if (err) {
            res.send({error: err});
        } else {
            res.send(data.Items);
        }
    });
});

app.get('/qrcode/:qrcode', function(req, res) {
    let params = {
        TableName: process.env.STICKAR_AWS_DDB_TABLE,
        KeyConditionExpression: "qrcode = :qrcode",
        ExpressionAttributeValues: {
            ":qrcode": req.params.qrcode
        },
        ScanIndexForward: true
    }
    
    dynamodb.query(params, function(err, data) {
        if (err) {
            res.send({error: err});
        } else {
            res.send(data.Items[0]);
        }
    });
});
