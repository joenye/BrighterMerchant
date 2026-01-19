import * as fs from 'fs';
import { Region, Regions, Config } from '../config/types';

export class RegionManager {
  regions: Regions;
  configPath: string;

  constructor(initialRegions: Regions, configPath: string, config?: Config) {
    this.configPath = configPath;
    // Deep copy initial regions to preserve color and title constants
    this.regions = {};
    for (const key in initialRegions) {
      this.regions[key] = { ...initialRegions[key] };
    }

    const regionData = config?.regions;
    if (regionData) {
      this.mergeRegions(regionData);
      console.log("[RegionManager] Loaded from config.regions in", this.configPath);
      return;
    }

    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        const rd = fileConfig.regions ? fileConfig.regions : fileConfig;
        this.mergeRegions(rd);
        console.log("[RegionManager] Loaded from", this.configPath);
      } catch (error) {
        console.error("[RegionManager] Error loading config:", error);
      }
    }
  }

  private mergeRegions(regionData: Regions): void {
    let mergedCount = 0;
    for (const key in this.regions) {
      if (regionData[key]) {
        this.regions[key].x = regionData[key].x ?? this.regions[key].x;
        this.regions[key].y = regionData[key].y ?? this.regions[key].y;
        this.regions[key].width = regionData[key].width ?? this.regions[key].width;
        this.regions[key].height = regionData[key].height ?? this.regions[key].height;
        mergedCount++;
      }
    }
    console.log(`[RegionManager] Merged ${mergedCount} regions`);
  }

  updateRegion(newRegion: Region & { id: string }): void {
    this.regions[newRegion.id] = {
      x: newRegion.x,
      y: newRegion.y,
      width: newRegion.width,
      height: newRegion.height,
      color: this.regions[newRegion.id]?.color || 'black',
      title: this.regions[newRegion.id]?.title || ""
    };

    let configData: any = {};
    if (fs.existsSync(this.configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (e) {
        console.error("Error reading config file in updateRegion:", e);
      }
    }
    if (!configData.regions) configData.regions = {};
    // Only save position and size, not color or title (those are constants)
    configData.regions[newRegion.id] = {
      x: newRegion.x,
      y: newRegion.y,
      width: newRegion.width,
      height: newRegion.height,
    };

    try {
      fs.writeFileSync(this.configPath, JSON.stringify(configData, null, 2));
    } catch (err) {
      console.error("Error writing config file:", err);
    }
  }

  generateRegionElementsHTML(): string {
    return Object.entries(this.regions)
      .map(([key, region]) => {
        // Show "Loading..." for chat region, hide other regions initially
        const initialContent = key === 'chatRegion' ? 'Loading...' : region.title;
        const initialDisplay = key === 'chatRegion' ? 'flex' : 'none';
        // Add rounded corners to bounty regions (active and board)
        let borderRadius = '';
        let border = '';
        if (key.startsWith('activeBountyRegion') || key.startsWith('boardRegion')) {
          borderRadius = 'border-radius: 14px;';
        } else if (key === 'chatRegion') {
          // Game-inspired border: outer dark line with inner lighter highlight
          border = 'border: 1px solid rgba(60, 55, 50, 0.9); box-shadow: inset 0 0 0 1px rgba(90, 85, 75, 0.6);';
        }
        
        return `
        <div id="${key}" style="
          position: absolute;
          left: ${region.x}px;
          top: ${region.y}px;
          width: ${region.width}px;
          height: ${region.height}px;
          background: ${region.color};
          cursor: move;
          display: ${initialDisplay};
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: white;
          text-align: center;
          font-family: 'Georgia', serif;
          overflow: hidden;
          ${borderRadius}
          ${border}">
          <span>${initialContent}</span>
          <span class="action-label"></span>
          <div class="resize-handle" style="
            position: absolute;
            right: 0;
            bottom: 0;
            width: 25px;
            height: 25px;
            background: ${region.color};
            cursor: nwse-resize;
            display: none;">
          </div>
        </div>
      `;
      })
      .join('');
  }
}
