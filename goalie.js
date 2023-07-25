/* 

    Script to identify the players with the worst shooting percentage against a given goaltender over the course of a single nhl regular season
    Only supports active players
    Run a search using the following format:
        
    node goalie <goalie-name> <YYYY-YYYY>

*/

const inquirer = require("inquirer");

async function getGoalieFromOptions(goalies) {
  const answer = await inquirer.prompt({
    type: "list",
    name: "goalie",
    message: "Which goalie would you like to analyze?",
    choices: goalies.map((goalie) => `${goalie.name} (${goalie.id})`),
  });
  return answer.goalie;
}

async function getGoalieInfo(name) {
  const data = await fetch(
    `https://suggest.svc.nhl.com/svc/suggest/v1/minactiveplayers/${name}/25`
  );
  const res = (await data.json()).suggestions;

  const goalies = res
    .filter((str) => str.indexOf("|G|") !== -1)
    .map((str) => {
      const id = parseInt(str.slice(0, str.indexOf("|")), 10);
      const startLastName = str.indexOf("|") + 1;
      const startFirstName = str.indexOf("|", startLastName) + 1;
      const name =
        str.slice(startFirstName, str.indexOf("|", startFirstName)) +
        " " +
        str.slice(startLastName, startFirstName - 1);

      return { name, id };
    });

  const answer = await getGoalieFromOptions(goalies);

  return {
    goalieName: answer.slice(0, answer.indexOf("(") - 1),
    goalieId: parseInt(
      answer.slice(answer.indexOf("(") + 1, answer.indexOf(")")),
      10
    ),
  };
}

// Obtain all regular season game links for the desired players team
async function getGameIds(goalieId, season) {
  let gameIds = [];
  const data = await fetch(
    `https://statsapi.web.nhl.com/api/v1/people/${goalieId}/stats?stats=gameLog&season=${season}&gameType=R`
  );
  const res = await data.json();
  res.stats[0].splits.forEach((gameInfo) => gameIds.push(gameInfo.game.link));
  return gameIds;
}

// Obtain all the shots a player took in a single regular season game
async function getGoalieSingleGameShots(gameId, goalieId) {
  let gameShots = [];
  const data = await fetch("https://statsapi.web.nhl.com/".concat(gameId));
  const res = await data.json();

  // Check all plays for those where the desired play is shooter or scorer
  for (const play of res.liveData.plays.allPlays) {
    // Check if play involves players at all
    if (!play.players) continue;

    const goalie = play.players.find(
      (goalieInfo) => goalieInfo.player.id === goalieId
    );

    if (!goalie) continue; // desired goalie not involved in play

    const playType = play.result.eventTypeId;

    if (playType !== "SHOT" && playType !== "GOAL") continue; // desired play is not a shot or goal

    const shooter = play.players.find(
      (playerInfo) =>
        playerInfo.playerType === "Shooter" ||
        playerInfo.playerType === "Scorer"
    );

    gameShots.push({
      player: shooter.player.fullName,
      wasGoal: playType === "GOAL",
    });
  }
  return gameShots;
}

// Get all shots for the desired player over the entire regular season
async function getGoalieSeasonShots(gameIds, goalieId) {
  let seasonShots = [];
  for (const gameId of gameIds) {
    const gameShots = await getGoalieSingleGameShots(gameId, goalieId);
    seasonShots.push(...gameShots);
  }
  return seasonShots;
}

function rankWorstSvPercentage(seasonShots, goalieName, season) {
  let map = new Map();
  seasonShots.forEach((shot) => {
    map.set(shot.player, {
      goals: map.has(shot.player)
        ? map.get(shot.player).goals + (shot.wasGoal ? 1 : 0)
        : shot.wasGoal
        ? 1
        : 0,
      shots: map.has(shot.player) ? map.get(shot.player).shots + 1 : 1,
    });
  });

  map = new Map(
    [...map.entries()].sort((a, b) => {
      const diff = a[1].goals / a[1].shots - b[1].goals / b[1].shots;

      // Handle if they are equal
      if (Math.abs(diff) < 0.001) {
        return b[1].shots - a[1].shots;
      }
      return diff;
    })
  );

  console.log();
  console.log();
  console.log(
    `Players with the worst shooting percentage against ${goalieName} during the ${season
      .toString()
      .slice(0, 4)}-${season.toString().slice(4)} season.`
  );
  console.log();
  console.log();
  for (const [key, value] of map) {
    console.log(
      `${key.padEnd(30)} ${(value.goals / value.shots)
        .toFixed(3)
        .padEnd(10)} Scored ${value.goals} of ${value.shots} shots`
    );
  }
  console.log();
  console.log();
}

async function run(name, season) {
  const { goalieName, goalieId } = await getGoalieInfo(name);
  const gameIds = await getGameIds(goalieId, season);
  const seasonShots = await getGoalieSeasonShots(gameIds, goalieId);
  rankWorstSvPercentage(seasonShots, goalieName, season);
}

if (process.argv.length !== 4) {
  console.log("Invalid formatting: Missing name or season argument");
  return;
}

if (process.argv[3].length !== 9 || process.argv[3].indexOf("-") !== 4) {
  console.log(
    "Invalid formatting: Season argument must be of format YYYY-YYYY"
  );
  return;
}

const formattedSeason = process.argv[3].slice(0, 4) + process.argv[3].slice(5);

if (parseInt(formattedSeason, 10) === NaN) {
  console.log(
    "Invalid formatting: Season argument must be composed of numerical characters"
  );
  return;
}

run(process.argv[2], formattedSeason);
