//@ts-nocheck
import { PriorityQueue } from "@datastructures-js/priority-queue";
import { edges, portals } from "./nodes";

/**
 * @typedef {Object} DistanceResult
 * @property {number} distance The shortest distance between two nodes
 * @property {number[]} path The path between the two nodes, where each number represents a node
 */

/**
 * Calculates the shortest path between two nodes
 * For more information on nodes, see:
 *    {@link markets}
 *    {@link edges}
 *    {@link portals}
 */
class GPS {
  #adjacencyMap;
  #cache;

  constructor(detectiveLevel, battleOfFortuneholdCompleted) {
    this.#adjacencyMap = new Map();
    this.#cache = new Map();
    this.#buildAdjacencyMap(detectiveLevel, battleOfFortuneholdCompleted);
  }

  /**
   * Returns the shortest path between two nodes
   * @param {number} node1 The name of a location. e.g, "Greengrocers"
   * @param {number} node2 The name of a location. e.g, "Tanners Road"
   * @returns {DistanceResult} The shortest distance between the two locations
   */
  distance(node1, node2) {
    const key = `${node1}-${node2}`;

    if (!this.#cache.has(key)) {
      const distance = this.#distance(node1, node2);
      this.#cache.set(key, distance);
    }

    return this.#cache.get(key);
  }

  getCacheSize() {
    return this.#cache.size;
  }

  #distance(node1, node2) {
    if (node1 === node2) {
      return { distance: 0, path: [node1] };
    }

    const pq = new PriorityQueue((a, b) => a.distance - b.distance);
    pq.enqueue({ distance: 0, node: node1 });

    const distances = new Map();
    const previous = new Map();

    for (let node of this.#adjacencyMap.keys()) {
      distances.set(node, Number.MAX_SAFE_INTEGER);
      previous.set(node, null);
    }

    distances.set(node1, 0);

    while (pq.size() > 0) {
      const { node, distance } = pq.dequeue();

      if (node === node2) {
        const path = this.#reconstructPath(previous, node1, node2);
        return {
          distance,
          path,
        };
      }

      if (distance > distances.get(node)) {
        continue;
      }

      const neighbors = this.#adjacencyMap.get(node);
      for (let [neighbor, weight] of neighbors) {
        const newDistance = distance + weight;

        // Only consider this path if it improves the known shortest distance
        if (newDistance >= distances.get(neighbor)) {
          continue;
        }

        distances.set(neighbor, newDistance);
        previous.set(neighbor, node);

        pq.enqueue({
          node: neighbor,
          distance: distance + weight,
        });
      }
    }

    throw new Error(`No path found between ${node1} and ${node2}`);
  }

  #reconstructPath(previous, start, target) {
    const path = [];
    let current = target;
    while (current !== null) {
      path.push(current);
      current = previous.get(current);
    }
    path.reverse();
    return path[0] === start ? path : [];
  }

  #addEdge(node1, node2, weight) {
    if (!this.#adjacencyMap.has(node1)) {
      this.#adjacencyMap.set(node1, []);
    }

    const neighbors = this.#adjacencyMap.get(node1);

    // Duplicate edge prevention, if an edge already exists between two nodes, keep the existing edge
    for (const [neighbor, existingWeight] of neighbors) {
      if (neighbor === node2) {
        // console.warn(
        //   `Edge between ${node1} and ${node2} already exists. Keeping existing edge with weight ${existingWeight}`,
        // );
        return;
      }
    }

    neighbors.push([node2, weight]);
  }

  #buildAdjacencyMap(detectiveLevel, battleOfFortuneholdCompleted) {
    for (const edge of edges) {
      const [node1, node2] = edge.nodes;

      // If an edge requires a detective level that is higher than the current detective level, skip the edge
      if (edge.detective > detectiveLevel) {
        continue;
      }

      // If an edge requires a quest to be completed that is not yet complete, skip the edge
      // (Battle of Fortunehold is the only quest that affects the graph as of now)
      if (edge.quest && !battleOfFortuneholdCompleted) {
        continue;
      }

      // If an edge is in a hostile zone, add additional weight to the edge to represent the chance of an encounter
      const weight = edge.hostile
        ? edge.weight + edge.chanceOfEncounter * edge.timeToResolve
        : edge.weight;

      this.#addEdge(node1, node2, weight);

      if (!edge.directed) {
        this.#addEdge(node2, node1, weight);
      }
    }

    // Portal zones can be travelled to from any other node
    for (let node of this.#adjacencyMap.keys()) {
      Object.entries(portals).forEach(([, portal]) => {
        this.#addEdge(node, portal.node, portal.teleportTime);
      });
    }
  }
}

export default GPS;
