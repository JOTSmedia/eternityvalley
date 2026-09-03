const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('Starting render process...');
    const outDir = __dirname;
    const assetsOutDir = path.join(__dirname, '..', '..', '..', 'assets', 'video');
    const finalMp4 = path.join(outDir, 'eternity_valley_trailer.mp4');
    
    // Launch headless browser
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    // Load the HTML file
    const fileUrl = 'file://' + path.join(__dirname, 'index.html') + '?export=true';
    console.log('Navigating to', fileUrl);
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    const durationSec = 30; // 30 seconds trailer
    const fps = 30;
    const frames = durationSec * fps;
    
    // Prepare ffmpeg
    const ffmpegCmd = 'ffmpeg';
    const ffmpegArgs = [
        '-y',
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-r', `${fps}`,
        '-i', '-',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        finalMp4
    ];
    
    console.log('Starting ffmpeg...');
    const ffmpeg = spawn(ffmpegCmd, ffmpegArgs);
    ffmpeg.stderr.on('data', (d) => process.stdout.write(d.toString()));
    
    // Give the page a moment to initialize the animation
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Rendering frames...');
    for (let i = 1; i <= frames; i++) {
        // Evaluate page time
        await page.evaluate((frameNumber, fps) => {
            if (window.seekToFrame) {
                window.seekToFrame(frameNumber, fps);
            }
        }, i, fps);
        
        // Take screenshot
        const screenshot = await page.screenshot({ type: 'png' });
        ffmpeg.stdin.write(screenshot);
        
        if (i % 30 === 0) {
            console.log(`Rendered frame ${i}/${frames}`);
        }
    }
    
    ffmpeg.stdin.end();
    
    ffmpeg.on('close', () => {
        console.log('Render complete! Saved to', finalMp4);
        
        // Copy to assets folder
        try {
            if (!fs.existsSync(assetsOutDir)) {
                fs.mkdirSync(assetsOutDir, { recursive: true });
            }
            const copyPath = path.join(assetsOutDir, 'eternity_valley_trailer.mp4');
            fs.copyFileSync(finalMp4, copyPath);
            console.log('Copied to', copyPath);
        } catch (e) {
            console.error('Failed to copy to assets', e);
        }
        
        browser.close();
    });
})();
