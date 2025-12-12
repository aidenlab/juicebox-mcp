/**
 * Natural Language Filter Module
 * 
 * Filters maps based on natural language queries.
 */

/**
 * Check if a value matches a query term (case-insensitive)
 * @param {string} value - Value to check
 * @param {string} term - Search term
 * @returns {boolean} True if matches
 */
function matchesTerm(value, term) {
  if (!value) return false;
  const valueStr = String(value).toLowerCase();
  const termStr = term.toLowerCase();
  return valueStr.includes(termStr);
}

/**
 * Score a match (higher is better)
 * @param {string} value - Value that matched
 * @param {string} term - Search term
 * @returns {number} Match score
 */
function scoreMatch(value, term) {
  if (!value) return 0;
  const valueStr = String(value).toLowerCase();
  const termStr = term.toLowerCase();
  
  // Exact match gets highest score
  if (valueStr === termStr) return 100;
  
  // Starts with term gets high score
  if (valueStr.startsWith(termStr)) return 80;
  
  // Contains term gets medium score
  if (valueStr.includes(termStr)) return 50;
  
  return 0;
}

/**
 * Filter maps by natural language query
 * @param {Array<Object>} maps - Array of map entries
 * @param {string} query - Natural language search query
 * @returns {Array<Object>} Filtered and sorted results
 */
export function filterMaps(maps, query) {
  if (!query || !query.trim()) {
    return maps;
  }
  
  // Split query into terms (AND logic - all terms must match)
  const terms = query.trim().split(/\s+/).filter(term => term.length > 0);
  
  if (terms.length === 0) {
    return maps;
  }
  
  // Score each map
  const scoredMaps = maps.map(map => {
    let totalScore = 0;
    let matchCount = 0;
    
    // Check each term against all metadata fields
    for (const term of terms) {
      let termMatched = false;
      let termScore = 0;
      
      // Check name field
      if (matchesTerm(map.name, term)) {
        termMatched = true;
        termScore = Math.max(termScore, scoreMatch(map.name, term));
      }
      
      // Check URL
      if (matchesTerm(map.url, term)) {
        termMatched = true;
        termScore = Math.max(termScore, scoreMatch(map.url, term) * 0.5); // URL matches are less important
      }
      
      // Check all metadata fields
      if (map.metadata) {
        for (const [key, value] of Object.entries(map.metadata)) {
          if (matchesTerm(value, term)) {
            termMatched = true;
            termScore = Math.max(termScore, scoreMatch(value, term));
          }
        }
      }
      
      if (termMatched) {
        totalScore += termScore;
        matchCount++;
      }
    }
    
    // All terms must match (AND logic)
    if (matchCount === terms.length) {
      return {
        ...map,
        _score: totalScore,
        _matchCount: matchCount
      };
    }
    
    return null;
  }).filter(map => map !== null);
  
  // Sort by score (highest first), then by name
  scoredMaps.sort((a, b) => {
    if (b._score !== a._score) {
      return b._score - a._score;
    }
    return a.name.localeCompare(b.name);
  });
  
  // Remove scoring metadata before returning
  return scoredMaps.map(({ _score, _matchCount, ...map }) => map);
}

