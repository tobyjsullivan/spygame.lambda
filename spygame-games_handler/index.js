'use strict';

console.log('Loading function');

const AWS = require('aws-sdk');
// const doc = require('dynamodb-doc');

// const dynamo = new doc.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient({region: 'us-west-2'});

const tableName = "spygame.games";

var getRandomLetter = function() {
    const possible = 'abcdefghijklmnopqrstuvwxyz1234567890';
    return possible.charAt(Math.floor(Math.random() * possible.length));
};

var generateId = function() {
    var out = "";
    for (var i = 0; i < 6; i++) {
        out += getRandomLetter();
    }
    
    return out;
};

var createGame = function() {
    return new Promise(function(fulfill, reject) {
        var gameId = generateId();
        
        var params = {};
        params.TableName = tableName;
        params.Item = {
            ID: gameId
        };
        
        docClient.put(params, (err, data) => {
        // dynamo.putItem(params, (resp) => {
            console.log("Response from client.put:", JSON.stringify(data), "Error:", JSON.stringify(err));
        
            if (err !== null) {
                reject(err);
            } else {
                fulfill({
                    gameId: gameId
                });
            }
        });    
    });
};

var readGame = function(gameId) {
    return new Promise((fulfill, reject) => {
        var params = {};
        params.TableName = tableName;
        params.Key = {
            ID: gameId
        };
        
        console.log("Using these params in dynamo.getItem:", JSON.stringify(params));
        
        docClient.get(params, (err, data) => {
        // dynamo.getItem(params, (data) => {
            console.log("DynamoDB getItem result:", JSON.stringify(data), "Error: ", JSON.stringify(err));
            
            if (err !== null) {
                reject(err);
            } else if (!data.Item) {
                reject(new Error("Game not found"));
            } else {
                fulfill({
                    id: data.Item.ID,
                    players: data.Item.Players ? data.Item.Players.values : [],
                    started: data.Item.Started || null
                });
            }
        });
    });
};

var addPlayer = function(gameId, playerName) {
    return new Promise((fulfill, reject) => {
        var params = {
            TableName: tableName,
            Key: {
                ID: gameId
            },
            UpdateExpression: "ADD Players :new_players",
            ConditionExpression: "attribute_exists(ID)",
            ExpressionAttributeValues: {
                ':new_players': docClient.createSet([playerName])
            },
            ReturnValues: "ALL_NEW"
        };
        
        console.log("Params for client.update:", JSON.stringify(params));
        
        docClient.update(params, (err, data) => {
            console.log("Response from docClient.update:", JSON.stringify(data), "Error:", JSON.stringify(err));
            
            if (err !== null) {
                reject(err);
            } else {
                fulfill({
                    id: data.Attributes.ID,
                    players: data.Attributes.Players.values
                });
            }
        });
    });
};

var startGame = function(gameId) {
    return new Promise((fulfill, reject) => {
        var params = {
            TableName: tableName,
            Key: {
                ID: gameId
            },
            UpdateExpression: "SET Started = :start_time",
            ConditionExpression: "attribute_not_exists(Started)",
            ExpressionAttributeValues: {
                ':start_time': new Date().toISOString()
            },
            ReturnValues: "ALL_NEW"
        };
        
        console.log("Params for client.update:", JSON.stringify(params));
        
        docClient.update(params, (err, data) => {
            console.log("Response from docClient.update:", JSON.stringify(data), "Error:", JSON.stringify(err));
            
            if (err !== null) {
                reject(err);
            } else {
                fulfill({
                    id: data.Attributes.ID,
                    started: data.Attributes.Started,
                    players: data.Attributes.Players ? data.Attributes.Players.values : []
                });
            }
        });
    });
};

var gameHandler = function(event, done) {
    var gameId = event.path.match(/\/games\/([a-z0-9]+)/)[1];
    switch (event.httpMethod) {
        // case 'DELETE':
        //     dynamo.deleteItem(JSON.parse(event.body), done);
        //     break;
        // case 'GET':
        //     dynamo.scan({ TableName: event.queryStringParameters.TableName }, done);
        //     break;
        case 'GET':
            readGame(gameId).then((game) => {
                done(null, { game: game });
            })
            .catch((ex) => {
                done(ex);
            });
            break;
        case 'POST':
            startGame(gameId).then((game) => {
                done(null, { game: game });
            })
            .catch((ex) => {
                done(ex);
            });
            break;
        // case 'PUT':
        //     dynamo.updateItem(JSON.parse(event.body), done);
        //     break;
        default:
            done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
};

var playersHandler = function(event, done) {
    switch (event.httpMethod) {
        // case 'DELETE':
        //     dynamo.deleteItem(JSON.parse(event.body), done);
        //     break;
        // case 'GET':
        //     dynamo.scan({ TableName: event.queryStringParameters.TableName }, done);
        //     break;
        case 'POST':
            var gameId = event.path.match(/\/games\/([a-z0-9]+)\/players/)[1];
            console.log('Event body:', JSON.parse(event.body));
            var playerName = JSON.parse(event.body).player.name;
            addPlayer(gameId, playerName).then((game) => {
                done(null, { game: game });
            })
            .catch((ex) => {
                done(ex);
            });
            break;
        // case 'PUT':
        //     dynamo.updateItem(JSON.parse(event.body), done);
        //     break;
        default:
            done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
};

var gamesHandler = function(event, done) {
    switch (event.httpMethod) {
        // case 'DELETE':
        //     dynamo.deleteItem(JSON.parse(event.body), done);
        //     break;
        // case 'GET':
        //     dynamo.scan({ TableName: event.queryStringParameters.TableName }, done);
        //     break;
        case 'POST':
            createGame().then((game) => {
                done(null, { game: game });
            });
            break;
        // case 'PUT':
        //     dynamo.updateItem(JSON.parse(event.body), done);
        //     break;
        default:
            done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
};

exports.handler = (event, context, callback) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    
    if (event.path == '/games') {
        gamesHandler(event, done);
    } else if ((/\/games\/[a-z0-9]+$/).test(event.path)) {
        gameHandler(event, done);
    } else if ((/\/games\/[a-z0-9]+\/players/).test(event.path)) {
        playersHandler(event, done);
    } else {
        done(new Error(`Unsupported path "${event.path}"`));
    }
};
