//@ts-nocheck
import { PriorityQueue } from "@datastructures-js/priority-queue";

import GPS from "./gps";
import combinations from "./combinations";
import { BountyStatus } from "./bounties";
import { bountyBoard, portals } from "./nodes";
import { bounties as bountyData } from "./bounties";

/**
 * @typedef {Object} Action
 * @property {string} type The type of action to take. E.g, "buy", "sell", "teleport", "walk"
 * @property {string} [item] (Optional) The item to buy or sell
 * @property {string} location The location to buy, sell, teleport, or walk to
 * @property {number} distance The total distance (time in seconds) it will take to complete the action
 *
 */

/**
 * @typedef {Object} FindBestBountiesResult
 * @property {string[]} bounties Keys from {@link bountyData} representing the best bounties to complete
 * @property {Action[]} actions Actions to take to complete the bounties
 * @property {number} distance The total distance (time in seconds) it will take to complete the bounties
 */

/**
 * @typedef {Object} FindBestRouteResult
 * @property {Action[]} actions Actions to take to complete the bounties
 * @property {number} distance The total distance (time in seconds) it will take to complete the bounties
 */

/**
 * Determines the best route to take to make all deliveries
 */
class Pathfinder {
  includeTeleportSteps = true; // Whether to include teleport steps in the path
  includeWalkingSteps = false; // Whether to include walking steps in the path
  inventorySpace = 24; // The maximum number of items that can be carried at once
  timeToBuy = 3; // The time in seconds it takes to buy an item
  timeToSell = 4; // The time in seconds it takes to sell an item

  /**
   * Estimates the minimum possible distance for a combo based on unique locations
   * This is a lower bound heuristic used for pruning
   */
  #estimateMinDistance(combo, gps) {
    const uniqueLocations = new Set();
    for (const bounty of combo) {
      uniqueLocations.add(bountyData[bounty].seller.node);
      uniqueLocations.add(bountyData[bounty].buyer.node);
    }
    
    // Rough estimate: 10 seconds per unique location + buy/sell time
    const baseTime = uniqueLocations.size * 10 + combo.length * (this.timeToBuy + this.timeToSell);
    return baseTime;
  }

  /**
   * Determines which deliveries should be made based on current and available deliveries
   * @param {string[]} bounties An array of keys from {@link bountyData}
   *   These are be the bounties the player has already accepted
   *   E.g, [CARROTS, SOAP, ...]
   * @param {number} detectiveLevel Level of players Detective skill, used to determine any additional rooms which can be accessed
   * @param {boolean} battleOfFortuneholdCompleted Whether the player has completed the Battle of Fortunehold quest which unlocks an additional room
   * @param {boolean} roundTrip Whether to return to the bounty board after completing all deliveries
   * @param {number} [numResults=5] (Optional) The number of bounty combinations return.
   *  If there are less than 5 possible combinations, all will be returned
   * @param {Object} [pruningOptions] (Optional) Options for pruning the search space
   * @param {number} [pruningOptions.maxCombinations=400] Maximum combinations to consider for large bounty sets
   * @param {number} [pruningOptions.maxEvaluations=150] Maximum combinations to evaluate before stopping
   * @param {number} [pruningOptions.pruningThreshold=0.95] Threshold for pruning based on efficiency (0-1, where 1 = no pruning)
   * @returns {FindBestBountiesResult[]} An array of objects containing the top {@link numResults} best bounties to complete
   */
  findBestBounties(
    bounties,
    detectiveLevel,
    battleOfFortuneholdCompleted,
    roundTrip,
    numResults = 5,
    pruningOptions = {},
  ) {
    const {
      maxCombinations = 400,
      maxEvaluations = 150,
      pruningThreshold = 0.95,
    } = pruningOptions;
    let results = [];

    const gps = new GPS(detectiveLevel, battleOfFortuneholdCompleted);

    // Always aim for exactly 6 bounties (max inventory)
    // We want to maximize total KP, not KP/D efficiency, so always use maxComboSize
    const maxComboSize = Math.min(bounties.length, 6);
    const combos = combinations(bounties, maxComboSize);
    
    if (maxCombinations === Infinity) {
      console.log(`[optimal] Checking all combinations of size ${maxComboSize}, total combinations: ${combos.length}`);
    }

    // Pre-calculate KP and estimated distance for each combo
    const comboData = combos.map((combo) => {
      const kp = combo.reduce((acc, bounty) => acc + bountyData[bounty].kp, 0);
      const estimatedDistance = this.#estimateMinDistance(combo, gps);
      
      return {
        combo,
        kp,
        estimatedDistance,
        estimatedEfficiency: kp / estimatedDistance,
      };
    });

    // Sort by estimated efficiency - this is much better than just KP
    comboData.sort((a, b) => b.estimatedEfficiency - a.estimatedEfficiency);

    const startTimestamp = Date.now();
    let evaluated = 0;
    let skipped = 0;

    for (const { combo, kp, estimatedEfficiency } of comboData) {
      // Early termination only if pruning is enabled
      if (pruningThreshold < 1.0 && results.length >= numResults) {
        const worstResult = results[results.length - 1];
        const worstEfficiency = worstResult.kp / worstResult.distance;
        
        // Use configurable pruning threshold
        if (estimatedEfficiency < worstEfficiency * pruningThreshold) {
          skipped = comboData.length - evaluated;
          break;
        }
      }

      // Also skip if we've evaluated enough and have good results (only if maxEvaluations is finite)
      if (maxEvaluations < Infinity && evaluated >= maxEvaluations && results.length >= numResults) {
        skipped = comboData.length - evaluated;
        break;
      }

      const threshold =
        results.length >= numResults
          ? results[results.length - 1].distance
          : Number.MAX_SAFE_INTEGER;

      const route = this.findBestRoute(combo, gps, threshold, roundTrip);
      evaluated++;

      if (route === null) {
        continue;
      }

      results.push({
        bounties: combo,
        actions: route.actions,
        distance: route.distance,
        kp,
      });

      // Keep only the best numResults, sorted by efficiency
      if (results.length > numResults) {
        results.sort((a, b) => b.kp / b.distance - a.kp / a.distance);
        results = results.slice(0, numResults);
      }
    }

    results.sort((a, b) => b.kp / b.distance - a.kp / a.distance);
    
    const elapsed = Date.now() - startTimestamp;
    console.log(`[perf] findBestBounties: ${(elapsed / 1000).toFixed(2)}s evaluated=${evaluated} skipped=${skipped} total=${comboData.length}`);
    
    return results;
  }

  /**
   * Determines the shortest route to complete all deliveries
   * @param {string[]} bounties An array containing bounties {@link bountyData}. E.g, [CARROTS, SOAP, ...]
   * @param {GPS} gps An instance of the Gps class
   * @param {number} threshold This method will "give up" on paths that are longer than this distance
   * @param {boolean} roundTrip Whether to return to the bounty board after completing all deliveries
   * @returns {FindBestRouteResult | null}
   *  Returns an object containing the actions to take and the total distance
   *  Returns null if no route is found that is shorter than the threshold
   */
  findBestRoute(bounties, gps, threshold = Number.MAX_SAFE_INTEGER, roundTrip) {
    const pq = new PriorityQueue((a, b) => a.distance - b.distance);
    const visited = new Map();
    let bestDistance = threshold;

    pq.enqueue({
      distance: 0,
      previousNode: null,
      currentNode: bountyBoard.node,
      bountyStates: [...new Array(bounties.length)].map(
        () => BountyStatus.NOT_STARTED,
      ),
      actions: [],
    });

    while (pq.size() > 0) {
      const {
        distance: originalDistance,
        previousNode,
        currentNode,
        bountyStates: originalBountyStates,
        actions: originalActions,
      } = pq.dequeue();

      // Early pruning: if this path is already longer than our best, skip it
      if (originalDistance >= bestDistance) {
        continue;
      }

      // Avoid mutating the original arrays by creating copies
      const bountyStates = [...originalBountyStates];
      const actions = [...originalActions];

      // Check if we have already found a shorter path to this location with the same deliveries
      const visitedKey = `${currentNode}-${bountyStates}`;
      if (
        visited.has(visitedKey) &&
        visited.get(visitedKey) <= originalDistance
      ) {
        continue;
      }
      visited.set(visitedKey, originalDistance);

      let distance = originalDistance;
      let numItemsBought = 0;
      let numItemsSold = 0;

      // Sell everything we can at the current location
      // It is important to sell items before purchasing to free up inventory space
      for (let i = 0; i < bounties.length; i++) {
        const bounty = bounties[i];
        if (currentNode !== bountyData[bounty].buyer.node) {
          continue;
        }

        if (bountyStates[i] !== BountyStatus.IN_PROGRESS) {
          continue;
        }

        if (numItemsBought + numItemsSold === 0) {
          this.#addTravelSteps(gps, actions, previousNode, currentNode);
        }

        numItemsSold += 1;
        distance += this.timeToSell;

        actions.push({
          type: "sell",
          item: bounty,
          location: bountyData[bounty].buyer.name,
          distance,
        });
        bountyStates[i] = BountyStatus.COMPLETED;
      }

      // Buy everything we can at the current location
      for (let i = 0; i < bounties.length; i++) {
        if (!this.#canPurchaseMoreItems(bountyStates)) {
          break;
        }

        const bounty = bounties[i];
        if (currentNode !== bountyData[bounty].seller.node) {
          continue;
        }

        if (bountyStates[i] !== BountyStatus.NOT_STARTED) {
          continue;
        }

        if (numItemsBought + numItemsSold === 0) {
          this.#addTravelSteps(gps, actions, previousNode, currentNode);
        }

        if (numItemsBought === 0) {
          distance += this.timeToBuy; // Buying more than one item takes no extra time
        }
        numItemsBought += 1;

        actions.push({
          type: "buy",
          item: bounty,
          location: bountyData[bounty].seller.name,
          distance: distance,
        });
        bountyStates[i] = BountyStatus.IN_PROGRESS;
      }

      // Give up on paths that are too long
      if (distance >= bestDistance) {
        continue;
      }

      if (this.#deliveriesCompleted(bountyStates)) {
        if (roundTrip && currentNode !== bountyBoard.node) {
          distance += gps.distance(currentNode, bountyBoard.node).distance;
          this.#addTravelSteps(gps, actions, currentNode, bountyBoard.node);
          actions.push({
            type: "return",
            location: bountyBoard.name,
            distance,
          });
          
          if (distance < bestDistance) {
            bestDistance = distance;
            return { actions, distance };
          }
        } else {
          if (distance < bestDistance) {
            bestDistance = distance;
            return { actions, distance };
          }
        }
      }

      // Enqueue next purchase locations
      if (this.#canPurchaseMoreItems(bountyStates)) {
        bounties
          .filter((b, i) => bountyStates[i] === BountyStatus.NOT_STARTED)
          .forEach((bounty) => {
            const nextNode = bountyData[bounty].seller.node;
            const { distance: nextDistance } = gps.distance(
              currentNode,
              nextNode,
            );
            const newDistance = distance + nextDistance;
            
            // Skip if this would exceed our best distance
            if (newDistance < bestDistance) {
              pq.enqueue({
                distance: newDistance,
                previousNode: currentNode,
                currentNode: nextNode,
                bountyStates,
                actions,
              });
            }
          });
      }

      // Enqueue next sell locations
      bounties
        .filter((d, i) => bountyStates[i] === BountyStatus.IN_PROGRESS)
        .forEach((bounty) => {
          const nextNode = bountyData[bounty].buyer.node;
          const { distance: nextDistance } = gps.distance(
            currentNode,
            nextNode,
          );
          const newDistance = distance + nextDistance;
          
          // Skip if this would exceed our best distance
          if (newDistance < bestDistance) {
            pq.enqueue({
              distance: newDistance,
              previousNode: currentNode,
              currentNode: nextNode,
              bountyStates,
              actions,
            });
          }
        });
    }
    
    return null;
  }

  /**
   * Updates the actions array with individual steps to take to get from one location to another
   * @param {GPS} gps An instance of the Gps class
   * @param {Action[]} actions An array of actions
   * @param {number} startNode Node of the starting location (reference {@link edges})
   * @param {number} endNode Name of the ending location, (reference {@link edges})
   */
  #addTravelSteps(gps, actions, startNode, endNode) {
    const { path } = gps.distance(startNode, endNode);
    if (path.length < 2) {
      return;
    }

    const currentDistance =
      actions.length > 0 ? actions[actions.length - 1].distance : 0;

    for (let i = 1; i < path.length - 1; i++) {
      if (
        this.includeTeleportSteps &&
        path[i] === portals.CRENOPOLIS_MARKET.node
      ) {
        actions.push({
          type: "teleport",
          location: portals.CRENOPOLIS_MARKET.name,
          distance: currentDistance + portals.CRENOPOLIS_MARKET.teleportTime,
        });
      } else if (
        this.includeTeleportSteps &&
        path[i] === portals.CRENOPOLIS_OUTSKIRTS.node
      ) {
        actions.push({
          type: "teleport",
          location: portals.CRENOPOLIS_OUTSKIRTS.name,
          distance: currentDistance + portals.CRENOPOLIS_OUTSKIRTS.teleportTime,
        });
      } else if (this.includeWalkingSteps) {
        actions.push({
          type: "walk",
          location: path[i],
        });
      }
    }
  }

  /**
   * Determines if more items can be purchased / carried in the inventory
   * @param {number[]} bountyStates An array of {@link BountyStatus} values representing the state of each bounty
   * @returns {boolean} True if more items can be purchased, false otherwise
   */
  #canPurchaseMoreItems(bountyStates) {
    let availableSpace = this.inventorySpace;

    for (const state of bountyStates) {
      if (state === BountyStatus.IN_PROGRESS) {
        availableSpace -= 6;
      }
    }

    return availableSpace >= 6;
  }

  /**
   * Determines if all deliveries have been completed
   * @param {number[]} bountyStates An array of {@link BountyStatus} values representing the state of each bounty
   * @returns {boolean} True if all deliveries have been completed, false otherwise
   */
  #deliveriesCompleted(bountyStates) {
    return bountyStates.every((state) => state === BountyStatus.COMPLETED);
  }
}

export default new Pathfinder();
