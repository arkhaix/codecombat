
var OGRE_TEAM = 'ogres';
var HUMAN_TEAM = 'humans';

var MY_TEAM = HUMAN_TEAM;
var ENEMY_TEAM = OGRE_TEAM;

var INITIAL_GOLD = 128;

var GRID_WIDTH = 7;
var GRID_HEIGHT = 7;

var TARGET_LENGTH = {};
TARGET_LENGTH[OGRE_TEAM] = GRID_HEIGHT;
TARGET_LENGTH[HUMAN_TEAM] = GRID_WIDTH;

var SEARCH_DEPTH = 1;

var BASE_SCORES = null;

var PROXIMITY_DELTAS = null;

var getTilePosition = {};
getTilePosition[HUMAN_TEAM] = function(t) { return t.x; };
getTilePosition[OGRE_TEAM] = function(t) { return t.y; };

var addTilePosition = {};
addTilePosition[HUMAN_TEAM] = function(x,y,i) { return {'x':x+i, 'y':y }; };
addTilePosition[OGRE_TEAM] = function(x,y,i) { return {'x':x, 'y':y+i }; };


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

// Helper for getTileProximityScores.
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
// long is the new path?
var memo = {};
function pathLengthIfTileConnects(tile, team) {
	memo[tile.x] = memo[tile.x] || {};
	memo[tile.x][tile.y] = memo[tile.x][tile.y] || {};
	if (team in memo[tile.x][tile.y]) {
		return memo[tile.x][tile.y];
	}

	var result = 0;

	var visited = makeGrid.call(this);
	var minPos = getTilePosition[team](tile);
	var maxPos = minPos;
	var q = [tile];
	while (q.length > 0) {
		var t = q.shift();
		visited[t.x][t.y] = true;
		var pos = getTilePosition[team](t);
		minPos = Math.min(minPos, pos);
		maxPos = Math.max(maxPos, pos);
		result = Math.max(result, 1+maxPos-minPos);
		for (var i=0;i<t.neighbors.length;i++) {
			var tn = t.neighbors[i];
			if (visited[tn.x][tn.y] !== true &&
				(tn.owner === team || (tn.x === tile.x && tn.y === tile.y))) {
					q.push(tn);
			}
		}
	}

	memo[tile.x][tile.y][team] = result;
	return result;
}

// Number of opportunities remaining to connect two segments across
// a row/column given by {@param tile}.  Consider:
// a b b
// 0 0 a
// b b a
// In this case, there is 1 tile (1,1) which connects team A's tiles
// and 2 tiles (0,1 and 1,1) which connect team B's.
// This function always assumes it is being called for MY_TEAM.
function connectionOpportunities(tile, myLongestPath) {
	var result = 0;
	var numEnemyCells = 0;

	var x=tile.x;
	var y=tile.y;
	var newPos = addTilePosition[ENEMY_TEAM](x,y,-1);
	x = newPos['x']; y = newPos['y'];
	var n=0;
	while (x>=0 && y>=0 && n<1) {
		n++;
		var t = this.getTile(x,y);
		if (t.owner === ENEMY_TEAM) {
			numEnemyCells++;
		}
		if (t.owner !== null) {
			continue;
		}
		if (pathLengthIfTileConnects.call(this, t, MY_TEAM) > myLongestPath) {
			result++;
		}
		newPos = addTilePosition[ENEMY_TEAM](x,y,-1);
		x = newPos['x']; y = newPos['y'];
	}

	x=tile.x;
	y=tile.y;
	newPos = addTilePosition[ENEMY_TEAM](x,y,1);
	x = newPos['x']; y = newPos['y'];
	n=0;
	while (x<GRID_WIDTH && y<GRID_HEIGHT && n<1) {
		n++;
		var t = this.getTile(x,y);
		if (t.owner === ENEMY_TEAM) {
			numEnemyCells++;
		}
		if (t.owner !== null) {
			continue;
		}
		if (pathLengthIfTileConnects.call(this, t, MY_TEAM) > myLongestPath) {
			result++;
		}
		newPos = addTilePosition[ENEMY_TEAM](x,y,1);
		x = newPos['x']; y = newPos['y'];
	}

	if (numEnemyCells === 0) {
		return TARGET_LENGTH[MY_TEAM];
	}

	return 1+result;
}


///// MAIN /////

	var goldRemaining = getGoldAmounts.call(this);
	var longestPaths = getLongestPaths.call(this);
	var myLongestPath = longestPaths[MY_TEAM];
	var myLongestPotentialPath = myLongestPath;
	var enemyLongestPath = longestPaths[ENEMY_TEAM];
	var enemyLongestPotentialPath = enemyLongestPath;

	// Get all relevant positional data
	var allBaseScores = getBaseTileScores.call(this);
	var allFriendlyProximityScores = getTileProximityScores.call(this, MY_TEAM);
	var allEnemyProximityScores = getTileProximityScores.call(this, ENEMY_TEAM);

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

	// Calculate desire (between 0 and 1)
	var myDesire = [];
	var enemyDesire = [];
	var connectionOpportunityOverride = 0;
	var numConnectionOpportunities = 0;

	for (var i=0;i<tilesThisTurn.length;i++) {
	    if (tilesThisTurn[i].owner !== null) {
	        myDesire[i] = 0;
	        continue;
	    }

		myDesire[i] = (0.1*baseScores[i]) + (0.2*friendlyProximityScores[i]);
		if (friendlyNewPathLengths[i] > myLongestPath) {
		    myDesire[i] += 0.7*(friendlyNewPathLengths[i]/TARGET_LENGTH[MY_TEAM]);
		    myLongestPotentialPath = Math.max(myLongestPotentialPath, friendlyNewPathLengths[i]);
		    if (friendlyNewPathLengths[i] >= 3) {
			    connectionOpportunityOverride = 1;
		    	var localNumConnectionOpportunities = connectionOpportunities.call(this, tilesThisTurn[i], myLongestPath);
		    	numConnectionOpportunities = Math.max(numConnectionOpportunities, localNumConnectionOpportunities);
		    }
		}
		if (friendlyNewPathLengths[i] == TARGET_LENGTH[MY_TEAM]) {
			myDesire[i] = 1;
		}

		enemyDesire[i] = (0.1*baseScores[i]) + (0.2*enemyProximityScores[i]);
		if (enemyNewPathLengths[i] > enemyLongestPath) {
			enemyDesire[i] += 0.7*(enemyNewPathLengths[i]/TARGET_LENGTH[ENEMY_TEAM]);
			enemyLongestPotentialPath = Math.max(enemyLongestPotentialPath, enemyNewPathLengths[i]);
		}
		if (enemyNewPathLengths[i] == TARGET_LENGTH[ENEMY_TEAM]) {
			enemyDesire[i] = 1;
		}
	}

	this.debug("myLongestPath(" + myLongestPath + ") potential(" + myLongestPotentialPath + ")");
	this.debug("enemyLongestPath(" + enemyLongestPath + ") potential(" + enemyLongestPotentialPath + ")");

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
	//this.debug("My desire: " + myDesire);

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
	//this.debug("Enemy desire: " + enemyDesire);

    var enemyMinBid = 1; //TODO: goldRemaining[ENEMY_TEAM] / nullTilesRemaining;
    var enemyMaxBid = goldRemaining[ENEMY_TEAM] / (TARGET_LENGTH[ENEMY_TEAM] - enemyLongestPotentialPath);
    var enemyBid = enemyMinBid + ((enemyMaxBid - enemyMinBid) * enemyMaxDesire);

	var myMinBid = 1; //TODO: goldRemaining[MY_TEAM] / nullTilesRemaining;
	var myMaxBid = goldRemaining[MY_TEAM] / (TARGET_LENGTH[MY_TEAM] - myLongestPotentialPath);
	var myBid = myMinBid + ((myMaxBid - myMinBid) * myMaxDesire);
	if (enemyBid > myBid && enemyLongestPotentialPath>enemyLongestPath) {
		this.debug("Denying enemy (enemyBid=" + enemyBid + ", myBid=" + myBid + ")");
		myBid = enemyBid + 1;
		if (enemyLongestPotentialPath < TARGET_LENGTH[ENEMY_TEAM]) {
			myBid = Math.min(myBid, INITIAL_GOLD/TARGET_LENGTH[MY_TEAM]);
		}
	}

	// More conservative bidding strategies if neither side can extend their path this turn
	if (myLongestPath===myLongestPotentialPath && enemyLongestPath===enemyLongestPotentialPath) {
	    if (myLongestPath >= TARGET_LENGTH[MY_TEAM]/1.5) {
		    this.debug("Conserving money to finish");
		    myBid = 0;
	    } else if (goldRemaining[MY_TEAM] < goldRemaining[ENEMY_TEAM] &&
	               myMaxDesire < 0.5 && enemyMaxDesire < 0.5) {
	        this.debug("Conserving money on low value tiles while behind");
	        myBid = Math.min(myBid, (0.01 * goldRemaining[MY_TEAM]));
	    } else if (goldRemaining[MY_TEAM] > goldRemaining[ENEMY_TEAM]) {
	        var goldAdvantage = goldRemaining[MY_TEAM] - goldRemaining[ENEMY_TEAM];
	        this.debug("Conserving to maintain gold advantage");
	        myBid = Math.min(myBid, goldAdvantage/4);
	    }
	} else if (connectionOpportunityOverride !== 0 && numConnectionOpportunities > 0) {
		this.debug("connectionOpportunityOverride(" + connectionOpportunityOverride + ") numConnectionOpportunities(" + numConnectionOpportunities + ")");
		var connectionBid = (0.9 * (myLongestPotentialPath/7) * goldRemaining[MY_TEAM]) / numConnectionOpportunities;
		if (connectionBid > myBid) {
			this.debug("Overriding previous bid for connection (" + connectionBid + " > " + myBid + ")");
			myBid = connectionBid;
		}
	}

	// Never bid more than the enemy's remaining gold (+1)
	if (myBid > goldRemaining[ENEMY_TEAM]) {
		this.debug("Adjusting down to enemy max");
		myBid = goldRemaining[ENEMY_TEAM]+1;
	}

	// Never bid more gold than we actually have
	if (myBid > goldRemaining[MY_TEAM]) {
		myBid = goldRemaining[MY_TEAM];
	}

	if (isNaN(myBid)) {
		myBid = 0;
	}

	this.debug("bid: " + myBid + " tile: " + myDesiredTile);
	return {gold: myBid, desiredTile: myDesiredTile};