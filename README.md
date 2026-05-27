# Free-Form Pseudo-3d Ray-Casting Engine (ORC)

## Parts of the system

[ ] Rays (Are Just Objects)
[ ] Renderer (Renders the lines)
[ ] Scene (Holds information about the world)
[ ] Observer (Handles generic stuffs like movement, collision etc)
[ ] Boundary (A wall)
[ ] Sectors (A collection of walls)
[ ] Material (The texture of the walls, ceiling and floor, can also be a solid color)
[ ] Sprites (Billboarded world object)

## Thoughts on rendering

For rendering textures I plan on doing something like this  
 0. load the textures  
 0. split textures into columns  
 0. repeat the textures (This doesn't have to be actual repetition,  
 you can simply take a modulo and begin rendering again)  
 0. instead of drawing a line, draw a column of the texture.
O - OVIETA
R - RAY
C - CASTER
