import sys
with open('js/WorldTerrain.js', 'r') as f:
    lines = f.readlines()

out = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
    
    # Dome Pavilion (lines 10744-10828 -> 85 lines)
    # Portcullis (lines 12018-12105 -> 88 lines)
    # MAGNIFICENT UPGRADES (64 lines)
    
    if "// 9. Breathtaking Grand Circular Colonnade and Dome Pavilion" in line:
        skip = 84
        continue
        
    if "// 6b. Inner Portcullis & Guard Chambers" in line:
        skip = 87
        continue
        
    if "// MAGNIFICENT UPGRADES - Buttresses, Stonework, Statues, Gargoyles" in line:
        skip = 63
        continue
        
    out.append(line)

with open('js/WorldTerrain.js', 'w') as f:
    f.writelines(out)
