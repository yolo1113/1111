function resetIfNonPositive(value, defaultValue) {
  if (value <= 0) {
    console.error('Invalid ' + value + ' changed to ' + defaultValue + '. The value should be positive.');
    return defaultValue;
  }
  return false;
}

function resetIfNegative(value, defaultValue) {
  if (value < 0) {
    console.error('Invalid ' + value + ' changed to ' + defaultValue + '. The value should be non-negative.');
    return defaultValue;
  }
  return false;
}

function resetVector3IfNonPositive(value, defaultValue) {
  if (value.x <= 0 || value.y <= 0 || value.z <= 0) {
    console.error('Box: Invalid "size" changed to ' + defaultValue.x + ' ' + defaultValue.y + ' ' + defaultValue.z + '. The value should be positive.');
    return defaultValue;
  }
}

function resetIfNotInRangeWithIncludedBounds(value, min, max, defaultValue) {
  if (value < min || value > max) {
    console.error('Invalid ' + value + ' changed to ' + defaultValue + '. The value should be in range [' + min + ', ' + max + '].');
    return defaultValue;
  }
}

export {resetIfNegative, resetIfNonPositive, resetVector3IfNonPositive, resetIfNotInRangeWithIncludedBounds};
