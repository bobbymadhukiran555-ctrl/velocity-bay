// The "Skyloop" stunt circuit near Velocity Airfield. Control points are x, z, height above sea level.
// Kept pure so tests can check it stays on the map and above the sea.
export const COASTER_WIDTH = 18;

export const COASTER_POINTS = [
  [-900, 180, 0.5],   // access road from the airport
  [-820, 160, 3],
  [-740, 115, 11],
  [-650, 80, 22],
  [-555, 85, 33],
  [-480, 135, 42],    // high banked sweeper
  [-495, 215, 43],
  [-560, 280, 34],
  [-655, 295, 22],
  [-750, 265, 12],
  [-830, 235, 4],
  [-880, 205, 0.5],   // exit back onto the access road
];
