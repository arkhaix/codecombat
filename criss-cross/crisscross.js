
var OGRE_TEAM = 'ogres';
var HUMAN_TEAM = 'humans';

var MY_TEAM = OGRE_TEAM;
var ENEMY_TEAM = HUMAN_TEAM;

var INITIAL_GOLD = 128;

var GRID_WIDTH = 7;
var GRID_HEIGHT = 7;

var TARGET_LENGTH = {};
TARGET_LENGTH[OGRE_TEAM] = GRID_HEIGHT;
TARGET_LENGTH[HUMAN_TEAM] = GRID_WIDTH;

var SEARCH_DEPTH = 2;

var BASE_SCORES = null;

var PROXIMITY_DELTAS = null;

function makeGrid() {
    var result = [];
    for (var i=0;i<GRID_WIDTH;i++) {
        result[i] = [];
    }
    return result;
}

function getGoldAmounts() {
	var result = {};
	result[HUMAN_TEAM] = INITIAL_GOLD;
	result[OGRE_TEAM] = INITIAL_GOLD;

	var previousTurn = this.turns.reduce(function(prev, cur, ind, arr) {
		if (prev === null) {
			return cur;
		}
		if (cur["number"] > prev["number"]) {
			return cur;
		}
		return prev;
	}, null);

	if (previousTurn !== null) {
		result[HUMAN_TEAM] = previousTurn["humanGold"];
		result[OGRE_TEAM] = previousTurn["ogreGold"];
	}

	return result;
}

// Calculates and returns initial base scores for all tiles.
// Returns an array[x][y] of score values between 0 and 1.
//
// This function gives the base scores of the tiles based only on their position
// within the grid.  It operates on the assumption that central tiles are worth
// more than outer tiles.  Returns a value between 0 and 1.
function getBaseTileScores() {
	var values = [];
	var a = 1;
	var n = Math.max(GRID_WIDTH, GRID_HEIGHT);
	for (var i=0;i<n/2;i++) {
		values[i] = a;
		values[n-(1+i)] = a;
		a = a * 2;
	}
	a = a / 2;

	var result = makeGrid.call(this);
	for (var y=0;y<GRID_HEIGHT;y++) {
		for (var x=0;x<GRID_WIDTH;x++) {
			result[x][y] = (values[x] * values[y]) / (a*a);
		}
	}
	return result;
}

function addProximityScores(tile, result) {
	var team = tile.owner;
	if (team === null) {
		return;
	}
	
	var tmp = makeGrid.call(this);
	
	for (var d=SEARCH_DEPTH;d>0;d--) {
	    for (var y=tile.y-d;y<=tile.y+d;y++) {
	        if (y<0 || y>=GRID_HEIGHT) {
	            continue;
	        }
	        for (var x=tile.x-d;x<=tile.x+d;x++) {
	            if (x<0 || x>=GRID_WIDTH) {
	                continue;
	            }
	            tmp[x][y]=1/(8*d);
	        }
	    }
	}

    for (var y=tile.y-SEARCH_DEPTH;y<=tile.y+SEARCH_DEPTH;y++) {
        if (y<0 || y>=GRID_HEIGHT) {
            continue;
        }
        for (var x=tile.x-SEARCH_DEPTH;x<=tile.x+SEARCH_DEPTH;x++) {
            if (x<0 || x>=GRID_WIDTH) {
                continue;
            }
            result[x][y] += tmp[x][y];
        }
    }
}

// Calculates and returns proximity scores for all tiles.
// Returns an array[x][y] of score values between 0 and 1.
//
// Proximity score is determined by how close an un-owned tile is to all
// owned tiles.  Each owned tile within a distance of 1 adds 1/8 value.
// Each owned tile within a distance of 2 adds 1/16 value.  Etc.
// Sum up the values for all the owned tiles within SEARCH_DEPTH distance
// of the selected tile and you have the proximity score for that tile.
// The score is then divided by SEARCH_DEPTH to give a value between 0 and 1.
function getTileProximityScores(team) {
	var result = makeGrid.call(this);
	for (var y=0;y<GRID_HEIGHT;y++) {
		for (var x=0;x<GRID_WIDTH;x++) {
			result[x][y] = 0;
		}
	}

	for (var y=0;y<GRID_HEIGHT;y++) {
		for (var x=0;x<GRID_WIDTH;x++) {
			var tile = this.getTile(x, y);
			if (tile.owner === team) {
				addProximityScores.call(this, tile, result);
			}
		}
	}

	return result;
}

// Finds the longest path for each team.
// Returns an object{HUMAN_TEAM:value, OGRE_TEAM:value}
function getLongestPaths() {
	var result = {};
	result[HUMAN_TEAM] = 0;
	result[OGRE_TEAM] = 0;

	var getTilePosition = {};
	getTilePosition[HUMAN_TEAM] = function(t) { return t.x; };
	getTilePosition[OGRE_TEAM] = function(t) { return t.y; };

	var visited = makeGrid.call(this);
	for (var y=0;y<GRID_HEIGHT;y++) {
		for (var x=0;x<GRID_WIDTH;x++) {
			var tile = this.getTile(x, y);
			if (visited[x][y] === true ||
				tile.owner === null) {
				continue;
			}
			var minPos = getTilePosition[tile.owner](tile);
			var maxPos = minPos;
			var q = [tile];
			while (q.length > 0) {
				var t = q.shift();
				if (visited[t.x][t.y] === true ||
					t.owner !== tile.owner) {
					continue;
				}
				visited[t.x][t.y] = true;
				var pos = getTilePosition[t.owner](t);
				minPos = Math.min(minPos, pos);
				maxPos = Math.max(maxPos, pos);
				result[t.owner] = Math.max(result[t.owner], 1+maxPos-minPos);
				for (var i=0;i<t.neighbors.length;i++) {
					q.push(t.neighbors[i]);
				}
			}
		}
	}

	return result;
}

// If {@param tile} param becomes owned by {@param team}, how
// long is the new path?  {@param getTilePosition} exists so that
// 'length' can mean either x-axis or y-axis distance by returning
// tile.x or tile.y.  An example:
// a 0 0 0
// a a 0 0
// 0 t a a
// Assuming {@param tile} is the tile at 't', and {@param team}
// is the team represented by 'a', and {@param getTilePosition}
// returns Tile.x, then this function would return 4.
// Without this tile, there would be two segments, both with length
// 2: the three a's in the top-left cover two columns, and the two 
// a's in the bottom-right also cover two columns.  If the 'a' team
// gains the tile 't', then the new path would connect all 4 columns.
// If {@param getTilePosition} returns Tile.y, then the function would
// return 3 since the connected segments would now cover all 3 rows.
function pathLengthIfTileConnects(newTile, newTeam) {
	var result = {};
	result[HUMAN_TEAM] = 0;
	result[OGRE_TEAM] = 0;

	var getTilePosition = {};
	getTilePosition[HUMAN_TEAM] = function(t) { return t.x; };
	getTilePosition[OGRE_TEAM] = function(t) { return t.y; };

	var visited = makeGrid.call(this);
	for (var y=0;y<GRID_HEIGHT;y++) {
		for (var x=0;x<GRID_WIDTH;x++) {
			var tile = this.getTile(x, y);
			var owner = tile.owner;
			if (newTile.x == x && newTile.y == y) {
			    owner = newTeam;
			}
			if (visited[x][y] === true ||
				owner === null) {
				continue;
			}
			var minPos = getTilePosition[owner](tile);
			var maxPos = minPos;
			var q = [tile];
			while (q.length > 0) {
				var t = q.shift();
				var tOwner = t.owner;
				if (newTile.x == t.x && newTile.y == t.y) {
				    tOwner = newTeam;
				}
				if (visited[t.x][t.y] === true ||
					tOwner !== owner) {
					continue;
				}
				visited[t.x][t.y] = true;
				var pos = getTilePosition[tOwner](t);
				minPos = Math.min(minPos, pos);
				maxPos = Math.max(maxPos, pos);
				result[tOwner] = Math.max(result[tOwner], 1+maxPos-minPos);
				for (var i=0;i<t.neighbors.length;i++) {
					q.push(t.neighbors[i]);
				}
			}
		}
	}

	return result[newTeam];
}

// Number of connected segments around a tile for a given team.
// An example (a = humans, b = ogres, 0 = null, t = tile param):
// a a 0
// b t 0
// 0 b a
// In this case, the tile t is the param passed to the function.
// The team param could be either a or b (humans or ogres).
// If team is a, then the result is 2.  The two a's in the top
// row form one segment, and they are not connected to the a in
// the bottom left corner, so that one forms its own segment.
// If team is b, then the result is 1.  The two b's in the
// left-middle and bottom-middle are connected (by the definition
// given by the game's rules, diagonal tiles are considered adjacent),
// forming one segment.
function numSegmentsAroundTile(tile, team) {
	var routeSegment = [];
	var numRouteSegments = 0;
	var curRouteSegment = -1;
	for (var i=0;i<tile.neighbors.length;i++) {
		if (tile.neighbors[i].owner !== team ||
			routeSegment[i] !== undefined) {
			continue;
		}
		curRouteSegment = numRouteSegments;
		numRouteSegments++;
		var visited = {};
		var q = [tile.neighbors[i]];
		while (q.length > 0) {
			var t = q.shift();
			if (visited[t] === true || 
				t.owner !== tile.owner) {
				continue;
			}
			visited[t] = true;
			routeSegment[i] = curRouteSegment;
			for (var j=0;j<tile.neighbors.length;j++) {
				if (this.tilesAreConnected(t, tile.neighbors[j])) {
					q.push(tile.neighbors[j]);
				}
			}
		}
	}

	return numRouteSegments;
}

function tilesAreConnected(tileA, tileB) {
	return (Math.abs(tileA.x - tileB.x) <= 1) && (Math.abs(tileA.y - tileB.y) <= 1);
}

	var goldRemaining = getGoldAmounts.call(this);
	var longestPaths = getLongestPaths.call(this);
	var myLongestPath = longestPaths[MY_TEAM];
	var enemyLongestPath = longestPaths[ENEMY_TEAM];
	this.debug("myLongestPath: " + myLongestPath);
	this.debug("enemyLongestPath: " + enemyLongestPath);

	// Get all relevant positional data
	var allBaseScores = getBaseTileScores.call(this);
	var allFriendlyProximityScores = getTileProximityScores.call(this, MY_TEAM);
	var allEnemyProximityScores = getTileProximityScores.call(this, ENEMY_TEAM);

	// Filter positional data to just the tiles being bid on this turn
	var tilesThisTurn = this.tileGroups[tileGroupLetter];
	var baseScores = [];
	var friendlyProximityScores = [];
	var enemyProximityScores = [];
	var friendlyNewPathLengths = [];
	var enemyNewPathLengths = [];
	for (var i=0;i<tilesThisTurn.length;i++) {
		var tile = tilesThisTurn[i];
		baseScores[i] = allBaseScores[tile.x][tile.y];
		friendlyProximityScores[i] = allFriendlyProximityScores[tile.x][tile.y];
		enemyProximityScores[i] = allEnemyProximityScores[tile.x][tile.y];
		friendlyNewPathLengths[i] = pathLengthIfTileConnects.call(this, tile, MY_TEAM);
		enemyNewPathLengths[i] = pathLengthIfTileConnects.call(this, tile, ENEMY_TEAM);
	}
	this.debug(friendlyNewPathLengths);

	// Calculate desire (between 0 and 1)
	// No idea how yet
	var myDesire = [];
	var enemyDesire = [];

	for (var i=0;i<tilesThisTurn.length;i++) {
	    if (tilesThisTurn[i].owner !== null) {
	        myDesire[i] = 0;
	        continue;
	    }

		myDesire[i] = (0.1*baseScores[i]) + (0.2*friendlyProximityScores[i]);
		if (friendlyNewPathLengths[i] > myLongestPath) {
		    myDesire[i] += 0.7*(friendlyNewPathLengths[i]/7);
		}
		if (friendlyNewPathLengths[i] == TARGET_LENGTH[MY_TEAM]) {
			myDesire[i] = 1;
		}

		enemyDesire[i] = (0.1*baseScores[i]) + (0.2*enemyProximityScores[i]);
		if (enemyNewPathLengths[i] > enemyLongestPath) {
			enemyDesire[i] += 0.7*(enemyNewPathLengths[i]/7);
		}
		if (enemyNewPathLengths[i] == TARGET_LENGTH[ENEMY_TEAM]) {
			enemyDesire[i] = 1;
		}
	}

	var myDesiredTile = null;
	var myMaxDesire = 0;
	var myDesiredIndex = 0;
	for (var i=0;i<myDesire.length;i++) {
		if (myDesire[i] > myMaxDesire) {
			myMaxDesire = myDesire[i];
			myDesiredTile = tilesThisTurn[i];
			myDesiredIndex = i;
		}
	}
	this.debug("My desire: " + myDesire);

	var enemyDesiredTile = null;
	var enemyMaxDesire = 0;
	var enemyDesiredIndex = 0;
	for (var i=0;i<enemyDesire.length;i++) {
		if (enemyDesire[i] > enemyMaxDesire) {
			enemyMaxDesire = enemyDesire[i];
			enemyDesiredTile = tilesThisTurn[i];
			enemyDesiredIndex = i;
		}
	}
	this.debug("Enemy desire: " + enemyDesire);

	var enemyBid = 0;
    if (myDesiredTile !== null) {
	    this.debug("x(" + myDesiredTile.x + ") y(" + myDesiredTile.y + ") base(" + baseScores[myDesiredIndex] + ") prox(" + friendlyProximityScores[myDesiredIndex] + ") len(" + friendlyNewPathLengths[myDesiredIndex] + ")");
	    var enemyMinBid = 1; //TODO: goldRemaining[ENEMY_TEAM] / nullTilesRemaining;
	    var enemyMaxBid = goldRemaining[ENEMY_TEAM] / (TARGET_LENGTH[ENEMY_TEAM] - enemyLongestPath);
	    enemyBid = enemyMinBid + ((enemyMaxBid - enemyMinBid) * enemyMaxDesire);
    } else {
        this.debug("wants no tiles");
    }
	var myMinBid = 1; //TODO: goldRemaining[MY_TEAM] / nullTilesRemaining;
	var myMaxBid = goldRemaining[MY_TEAM] / (GRID_WIDTH - myLongestPath);
	var myBid = myMinBid + ((myMaxBid - myMinBid) * myMaxDesire);
	if (enemyBid > myBid) {
		myBid = enemyBid + 1;
	}
	this.debug("bid: " + myBid + " tile: " + myDesiredTile);
	return {gold: myBid, desiredTile: myDesiredTile};

	// Add enemy denial
