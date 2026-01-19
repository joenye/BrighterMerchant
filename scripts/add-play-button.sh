#!/bin/bash

# This script adds a play button overlay to video poster images
# Requires ImageMagick: brew install imagemagick

if ! command -v convert &> /dev/null; then
    echo "ImageMagick is not installed. Install it with:"
    echo "  brew install imagemagick"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$SCRIPT_DIR/../website"

# Function to add play button to an image
add_play_button() {
    local input_file="$1"
    local temp_file="${input_file}.tmp.jpg"
    
    if [ ! -f "$input_file" ]; then
        echo "✗ File not found: $input_file"
        return 1
    fi
    
    # Get image dimensions
    local width=$(identify -format "%w" "$input_file")
    local height=$(identify -format "%h" "$input_file")
    
    # Calculate button size as 10% of image width (minimum 180px)
    local button_size=$((width / 10))
    if [ $button_size -lt 180 ]; then
        button_size=180
    fi
    
    local center_x=$((width / 2))
    local center_y=$((height / 2))
    local radius=$((button_size / 2))
    
    # Triangle size proportional to button
    local triangle_width=$((button_size * 4 / 9))
    local triangle_height=$((button_size * 5 / 9))
    
    # Create play button overlay
    convert "$input_file" \
        -fill "rgba(0,0,0,0.7)" \
        -draw "circle $center_x,$center_y $((center_x + radius)),$center_y" \
        -fill none -stroke white -strokewidth 3 \
        -draw "circle $center_x,$center_y $((center_x + radius - 3)),$center_y" \
        -fill white \
        -draw "polygon $((center_x - triangle_width / 2)),$((center_y - triangle_height / 2)) $((center_x - triangle_width / 2)),$((center_y + triangle_height / 2)) $((center_x + triangle_width / 2)),$center_y" \
        "$temp_file"
    
    # Replace original with new image
    mv "$temp_file" "$input_file"
    echo "✓ Added play button to $input_file"
}

# Process both poster images
add_play_button "$WEBSITE_DIR/demo-poster.jpg"
add_play_button "$WEBSITE_DIR/setup-poster.jpg"

echo ""
echo "Done! Play buttons added to poster images."
