import { bounties } from '../../algorithm/bounties';
import { BOUNTY_NAMES } from '../config/constants';
import { resolveBountyKeyFromName } from './bounty-resolver';

interface BountyMatchScore {
  bountyKey: string;
  score: number;
  matches: {
    hasQuantity: boolean;
    nameMatch: number;
    buyerMatch: number;
    sellerMatch: number;
  };
}

interface BountyCandidate {
  bountyKey: string;
  nameLength: number;
  isPartOfLargerWord: boolean;
  position: number; // Position in the OCR text (earlier = more likely to be bounty name)
}

interface FuzzyMatchDebug {
  bountyKey: string;
  score: number;
  nameScore: number;
  fromScore: number;
  toScore: number;
  positionBonus: number;
}

interface FuzzyMatchResult {
  bountyKey: string | null;
  topMatches: FuzzyMatchDebug[];
}

/**
 * Calculate Levenshtein distance between two strings (edit distance)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical)
 */
function stringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Check if text contains a substring with fuzzy matching
 */
function fuzzyContains(text: string, search: string, threshold: number = 0.7): number {
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  
  // Exact match
  if (textLower.includes(searchLower)) {
    return 1.0;
  }
  
  // Try sliding window fuzzy match
  let bestScore = 0;
  for (let i = 0; i <= textLower.length - searchLower.length; i++) {
    const window = textLower.substring(i, i + searchLower.length);
    const score = stringSimilarity(window, searchLower);
    bestScore = Math.max(bestScore, score);
  }
  
  return bestScore;
}

/**
 * Match OCR text to a bounty using fuzzy matching on name, buyer, and seller
 * Returns both the match and debug info about top candidates
 */
export function fuzzyMatchBounty(ocrText: string): string | null {
  const result = fuzzyMatchBountyWithDebug(ocrText);
  return result.bountyKey;
}

/**
 * Match OCR text to a bounty with detailed debug information
 */
export function fuzzyMatchBountyWithDebug(ocrText: string): FuzzyMatchResult {
  const text = ocrText.replace(/\s/g, '').toLowerCase();
  
  // Check for quantity indicator (6, 6x, x6, etc.)
  const hasQuantity = /6|x6|6x/.test(text);
  if (!hasQuantity) {
    return { bountyKey: null, topMatches: [] };
  }
  
  // Score each bounty based on how well its name, seller, and buyer match substrings in the text
  const scores: Array<{
    bountyKey: string;
    score: number;
    nameScore: number;
    fromScore: number;
    toScore: number;
    positionBonus: number;
  }> = [];
  
  for (const [bountyKey, bountyData] of Object.entries(bounties)) {
    const bountyName = bountyData.name.toLowerCase();
    const fromLocation = bountyData.seller?.name?.toLowerCase().replace(/\s/g, '').replace(/'/g, '') || '';
    const toLocation = bountyData.buyer?.name?.toLowerCase().replace(/\s/g, '').replace(/'/g, '') || '';
    
    // Calculate how well each field matches as a substring in the OCR text
    const nameScore = fuzzyContains(text, bountyName);
    const fromScore = fromLocation ? fuzzyContains(text, fromLocation) : 0;
    const toScore = toLocation ? fuzzyContains(text, toLocation) : 0;
    
    // Position bonus: if the bounty name appears early in the text, give a huge bonus
    // This helps distinguish "ScentedCandle" (appears early) from "Soap" (appears late in "SoapStall")
    let positionBonus = 0;
    const nameIndex = text.indexOf(bountyName);
    if (nameIndex !== -1) {
      const relativePosition = nameIndex / text.length;
      if (relativePosition < 0.3) {
        // Name appears in first 30% of text - very likely to be the bounty name
        positionBonus = 0.3;
      } else if (relativePosition < 0.5) {
        // Name appears in first half - possibly the bounty name
        positionBonus = 0.1;
      }
      // No bonus if name appears in second half (likely part of location name)
    }
    
    // Location match bonus: if BOTH from and to locations match exactly, this is very likely the correct bounty
    // This helps when OCR mangles the bounty name but gets the locations right
    let locationBonus = 0;
    if (fromScore === 1.0 && toScore === 1.0) {
      // Both locations match exactly - very strong signal
      locationBonus = 0.4;
    } else if (fromScore === 1.0 || toScore === 1.0) {
      // One location matches exactly
      locationBonus = 0.15;
    }
    
    // Weighted score: name is most important (70%), from and to are secondary (15% each)
    // Plus position bonus if name appears early, plus location bonus for exact location matches
    const totalScore = nameScore * 0.7 + fromScore * 0.15 + toScore * 0.15 + positionBonus + locationBonus;
    
    scores.push({
      bountyKey,
      score: totalScore,
      nameScore,
      fromScore,
      toScore,
      positionBonus,
    });
  }
  
  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);
  
  // Get top 3 for debug info
  const topMatches = scores.slice(0, 3);
  
  // Return the best match if score is above threshold
  const bestMatch = scores[0];
  if (bestMatch.score > 0.5) {
    return { bountyKey: bestMatch.bountyKey, topMatches };
  }
  
  return { bountyKey: null, topMatches };
}
