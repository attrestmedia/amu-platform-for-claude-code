# Text Motion Library

## 001

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Fade In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Fade In Animation";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'fadeIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 002

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Typewriter Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Hello, I am typing...";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            let i = 0;
            function type() {
                if (i < chars.length) {
                    const span = document.createElement('span');
                    span.className = 'char';
                    span.textContent = chars[i];
                    container.appendChild(span);
                    i++;
                    setTimeout(type, 80);
                } else {
                    setTimeout(play, 2500);
                }
            }
            type();
        }
        play();
    </script>
</body>
</html>

===

## 003

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Shuffle Text Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Matrix Shuffle Effect";
        const container = document.getElementById('anim-container');
        const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            const spanList = chars.map(c => {
                const span = document.createElement('span');
                span.className = 'char';
                container.appendChild(span);
                return { el: span, char: c, isSpace: c === ' ' };
            });
            
            let frame = 0;
            function update() {
                let allDone = true;
                spanList.forEach((item, i) => {
                    if (item.isSpace) { item.el.textContent = ' '; return; }
                    const startFrame = i * 2;
                    const endFrame = startFrame + 15;
                    if (frame < startFrame) {
                        allDone = false; item.el.textContent = '';
                    } else if (frame < endFrame) {
                        allDone = false; item.el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                    } else {
                        item.el.textContent = item.char;
                    }
                });
                frame++;
                if (!allDone) {
                    setTimeout(() => requestAnimationFrame(update), 30);
                } else {
                    setTimeout(play, 2500);
                }
            }
            update();
        }
        play();
    </script>
</body>
</html>

===

## 004

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slide Up Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Slide Up Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slideUp 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 005

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Scale In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Pop! Scale In";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'scaleIn 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 006

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Blur In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes blurIn { from { filter: blur(12px); opacity: 0; transform: scale(1.1); } to { filter: blur(0); opacity: 1; transform: scale(1); } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Focusing Blur In";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'blurIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 007

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Glow In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes glowIn { 0% { opacity: 0; text-shadow: 0 0 0px rgba(255,255,255,0); } 50% { opacity: 1; text-shadow: 0 0 20px rgba(255,255,255,1); } 100% { opacity: 1; text-shadow: 0 0 0px rgba(255,255,255,0); } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Neon Glow Text";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'glowIn 1s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 008

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Bounce Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes bounceIn { 0% { transform: translateY(-50px); opacity: 0; animation-timing-function: cubic-bezier(0.8, 0, 1, 1); } 50% { transform: translateY(15px); opacity: 1; animation-timing-function: cubic-bezier(0, 0, 0.2, 1); } 75% { transform: translateY(-5px); opacity: 1; animation-timing-function: cubic-bezier(0.8, 0, 1, 1); } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Bouncy Letters";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'bounceIn 0.6s forwards';
                span.style.animationDelay = `${index * 0.08}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.08 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 009

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flip In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flipIn { from { transform: perspective(400px) rotateX(-90deg); opacity: 0; transform-origin: bottom; } to { transform: perspective(400px) rotateX(0deg); opacity: 1; transform-origin: bottom; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "3D Flip Appearance";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flipIn 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 010

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rotate In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rotateIn { from { transform: rotate(-180deg) scale(0); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Spinning Words";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rotateIn 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 011

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slide Down Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Falling Downwards";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slideDown 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 012

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slide Left Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slideLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Slide From Left";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slideLeft 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 013

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slide Right Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slideRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Slide From Right";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slideRight 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 014

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Drop In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes dropIn { 0% { transform: translateY(-200%); opacity: 0; } 60% { transform: translateY(20%); opacity: 1; } 80% { transform: translateY(-10%); opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Heavy Drop In";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'dropIn 0.6s forwards';
                span.style.animationDelay = `${index * 0.06}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.06 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 015

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Swing Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes swing { 0% { opacity: 0; transform: rotate(15deg); } 20% { opacity: 1; transform: rotate(15deg); } 40% { transform: rotate(-10deg); opacity: 1; } 60% { transform: rotate(5deg); opacity: 1; } 80% { transform: rotate(-5deg); opacity: 1; } 100% { transform: rotate(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Swinging Pendulum";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'swing 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 016

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Pulse Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Heartbeat Pulse";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'pulse 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 017

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flash Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flash { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flashing Lights";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flash 1s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 018

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Shake X Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes shakeX { 0%, 100% { transform: translateX(0); opacity: 0; } 10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); opacity: 1; } 20%, 40%, 60%, 80% { transform: translateX(10px); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Horizontal Shake";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'shakeX 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 019

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Shake Y Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes shakeY { 0%, 100% { transform: translateY(0); opacity: 0; } 10%, 30%, 50%, 70%, 90% { transform: translateY(-10px); opacity: 1; } 20%, 40%, 60%, 80% { transform: translateY(10px); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Vertical Shake";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'shakeY 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 020

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Tada Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes tada { 0% { transform: scale(1); opacity: 0; } 10%, 20% { transform: scale(0.9) rotate(-3deg); opacity: 1; } 30%, 50%, 70%, 90% { transform: scale(1.1) rotate(3deg); opacity: 1; } 40%, 60%, 80% { transform: scale(1.1) rotate(-3deg); opacity: 1; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Tada! Surprise!";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'tada 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 021

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Jello Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes jello { 0% { transform: translate(0); opacity: 0; } 11.1% { transform: skewX(-12.5deg) skewY(-12.5deg); opacity: 1; } 22.2% { transform: skewX(6.25deg) skewY(6.25deg); opacity: 1; } 33.3% { transform: skewX(-3.125deg) skewY(-3.125deg); opacity: 1; } 44.4% { transform: skewX(1.5625deg) skewY(1.5625deg); opacity: 1; } 55.5% { transform: skewX(-0.78125deg) skewY(-0.78125deg); opacity: 1; } 66.6% { transform: skewX(0.390625deg) skewY(0.390625deg); opacity: 1; } 77.7% { transform: skewX(-0.1953125deg) skewY(-0.1953125deg); opacity: 1; } 100% { transform: translate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Jiggly Jello";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'jello 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 022

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rubber Band Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rubberBand { 0% { transform: scale(1); opacity: 0; } 30% { transform: scaleX(1.25) scaleY(0.75); opacity: 1; } 40% { transform: scaleX(0.75) scaleY(1.25); opacity: 1; } 50% { transform: scaleX(1.15) scaleY(0.85); opacity: 1; } 65% { transform: scaleX(0.95) scaleY(1.05); opacity: 1; } 75% { transform: scaleX(1.05) scaleY(0.95); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Bouncy Rubber Band";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rubberBand 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 023

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Wave Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes wave { 0%, 100% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(-15px); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Ocean Wave Effect";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'wave 0.6s forwards';
                span.style.animationDelay = `${index * 0.08}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.08 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 024

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Stretch Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes stretch { 0% { transform: scaleX(1); opacity: 0; } 50% { transform: scaleX(1.5); opacity: 1; } 100% { transform: scaleX(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Stretching Out";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'stretch 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 025

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Squeeze Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes squeeze { 0% { transform: scaleY(1); opacity: 0; } 50% { transform: scaleY(0.5); opacity: 1; } 100% { transform: scaleY(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Squeezing In";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'squeeze 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 026

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Roll In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rollIn { 0% { transform: translateX(-100%) rotate(-120deg); opacity: 0; } 100% { transform: translateX(0) rotate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rolling Like A Barrel";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rollIn 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 027

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Zoom In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes zoomIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Zooming In Fast";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'zoomIn 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 028

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Zoom Out Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes zoomOut { 0% { transform: scale(2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Zooming Out Slow";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'zoomOut 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 029

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Roll In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rollIn { 0% { transform: translateX(-100%) rotate(-120deg); opacity: 0; } 100% { transform: translateX(0) rotate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rolling Like A Barrel";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rollIn 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 030

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Glitch Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes glitch { 0% { transform: translate(0); opacity: 0; } 10% { transform: translate(-2px, 2px); opacity: 1; } 20% { transform: translate(-2px, -2px); opacity: 1; } 30% { transform: translate(2px, 2px); opacity: 1; } 40% { transform: translate(2px, -2px); opacity: 1; } 50% { transform: translate(-2px, 2px); opacity: 1; } 60% { transform: translate(-2px, -2px); opacity: 1; } 70% { transform: translate(2px, 2px); opacity: 1; } 80% { transform: translate(2px, -2px); opacity: 1; } 90% { transform: translate(-2px, 2px); opacity: 1; } 100% { transform: translate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Cyber Glitch 404";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'glitch 0.4s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (0.4 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 031

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Focus In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes focusIn { 0% { filter: blur(12px); transform: scale(1.5); opacity: 0; } 100% { filter: blur(0); transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Focusing In Sight";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'focusIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 032

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Random Reveal Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Appearing Randomly";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            const indices = Array.from(Array(chars.length).keys()).sort(() => Math.random() - 0.5);
            
            chars.forEach((c) => {
                const span = document.createElement('span');
                span.className = 'char';
                span.textContent = c;
                span.style.opacity = '0';
                container.appendChild(span);
            });
            
            const spans = container.querySelectorAll('.char');
            let i = 0;
            function reveal() {
                if (i < indices.length) {
                    spans[indices[i]].style.opacity = '1';
                    i++;
                    setTimeout(reveal, 50);
                } else {
                    setTimeout(play, 2500);
                }
            }
            reveal();
        }
        play();
    </script>
</body>
</html>

===

## 033

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Binary Decode Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "01001011 Decode";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            const spanList = chars.map(c => {
                const span = document.createElement('span');
                span.className = 'char';
                container.appendChild(span);
                return { el: span, char: c, isSpace: c === ' ' };
            });
            
            let frame = 0;
            function update() {
                let allDone = true;
                spanList.forEach((item, i) => {
                    if (item.isSpace) { item.el.textContent = ' '; return; }
                    const startFrame = i * 3;
                    const endFrame = startFrame + 20;
                    if (frame < startFrame) {
                        allDone = false; item.el.textContent = '';
                    } else if (frame < endFrame) {
                        allDone = false; item.el.textContent = Math.random() > 0.5 ? '1' : '0';
                    } else {
                        item.el.textContent = item.char;
                    }
                });
                frame++;
                if (!allDone) {
                    setTimeout(() => requestAnimationFrame(update), 40);
                } else {
                    setTimeout(play, 2500);
                }
            }
            update();
        }
        play();
    </script>
</body>
</html>

===

## 034

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Fall Down Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes fallDown { 0% { transform: translateY(-50px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Falling Characters";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'fallDown 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 035

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rise Up Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes riseUp { 0% { transform: translateY(50px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rising Characters";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'riseUp 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 036

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Pop In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Popping Bubbles";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'popIn 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 037

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slit In Vertical Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slitInV { 0% { transform: scaleY(0); opacity: 0; } 100% { transform: scaleY(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Vertical Slit Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slitInV 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 038

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slit In Horizontal Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slitInH { 0% { transform: scaleX(0); opacity: 0; } 100% { transform: scaleX(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Horizontal Slit";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slitInH 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 039

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Roll In Top Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rollInTop { 0% { transform: translateY(-50px) rotate(-120deg); opacity: 0; } 100% { transform: translateY(0) rotate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rolling From Top";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rollInTop 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 040

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Roll In Bottom Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rollInBottom { 0% { transform: translateY(50px) rotate(120deg); opacity: 0; } 100% { transform: translateY(0) rotate(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rolling From Bottom";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rollInBottom 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 041

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Bounce In Left Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes bounceInLeft { 0% { transform: translateX(-50px); opacity: 0; } 60% { transform: translateX(10px); opacity: 1; } 80% { transform: translateX(-5px); opacity: 1; } 100% { transform: translateX(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Bouncing From Left";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'bounceInLeft 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 042

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Bounce In Right Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes bounceInRight { 0% { transform: translateX(50px); opacity: 0; } 60% { transform: translateX(-10px); opacity: 1; } 80% { transform: translateX(5px); opacity: 1; } 100% { transform: translateX(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Bouncing From Right";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'bounceInRight 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 043

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rotate In Y Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rotateInY { 0% { transform: perspective(400px) rotateY(90deg); opacity: 0; } 100% { transform: perspective(400px) rotateY(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Y-Axis Rotation";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rotateInY 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 044

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rotate In X Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rotateInX { 0% { transform: perspective(400px) rotateX(90deg); opacity: 0; } 100% { transform: perspective(400px) rotateX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "X-Axis Rotation";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rotateInX 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 045

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flicker Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flicker { 0%, 2%, 4%, 8%, 12%, 16%, 20% { opacity: 0; } 1%, 3%, 5%, 9%, 13%, 17%, 21%, 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flickering Lights";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flicker 1.2s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1.2 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 046

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Blur In Right Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes blurInRight { 0% { transform: translateX(50px); filter: blur(10px); opacity: 0; } 100% { transform: translateX(0); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Motion Blur Right";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'blurInRight 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 047

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Blur In Left Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes blurInLeft { 0% { transform: translateX(-50px); filter: blur(10px); opacity: 0; } 100% { transform: translateX(0); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Motion Blur Left";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'blurInLeft 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 048

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Fly In Up Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flyInUp { 0% { transform: translateY(200px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flying High Up";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flyInUp 0.8s forwards';
                span.style.animationDelay = `${index * 0.03}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.03 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 049 Levin

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Fly In Down Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flyInDown { 0% { transform: translateY(-200px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flying Way Down";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flyInDown 0.8s forwards';
                span.style.animationDelay = `${index * 0.03}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.03 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 050

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Wobble Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes wobble { 0% { transform: translateX(0%); } 15% { transform: translateX(-15%) rotate(-5deg); opacity: 1; } 30% { transform: translateX(10%) rotate(3deg); } 45% { transform: translateX(-10%) rotate(-3deg); } 60% { transform: translateX(5%) rotate(2deg); } 75% { transform: translateX(-2%) rotate(-1deg); } 100% { transform: translateX(0%); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Wobbly Jelly Text";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'wobble 1s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 051

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Block Reveal Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Stylish Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = `<span style="position:relative; display:inline-block; overflow:hidden;">
                <span id="br-text" style="opacity:0; display:inline-block;">${text}</span>
                <span id="br-block" style="position:absolute; top:0; left:0; width:100%; height:100%; background-color:#ffffff; transform-origin:left; transform:scaleX(0); transition:transform 0.5s cubic-bezier(0.86, 0, 0.07, 1);"></span>
            </span>`;
            
            const textEl = document.getElementById('br-text');
            const blockEl = document.getElementById('br-block');
            
            setTimeout(() => { blockEl.style.transform = 'scaleX(1)'; }, 100);
            setTimeout(() => {
                textEl.style.opacity = '1';
                blockEl.style.transformOrigin = 'right';
                blockEl.style.transform = 'scaleX(0)';
            }, 600);
            
            setTimeout(play, 2500 + 1100);
        }
        play();
    </script>
</body>
</html>

===

## 052

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Tracking Expand Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes trackingInExpand { 0% { letter-spacing: -0.5em; opacity: 0; } 100% { letter-spacing: 0.05em; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Expand Spacing";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = text;
            span.style.opacity = '0';
            span.style.animation = 'trackingInExpand 1.2s forwards';
            container.appendChild(span);
            
            setTimeout(play, (1.2 * 1000) + 2500);
        }
        play();
    </script>
</body>
</html>

===

## 053

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Tracking Contract Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes trackingInContract { 0% { letter-spacing: 1em; opacity: 0; } 100% { letter-spacing: 0.05em; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Contract Spacing";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = text;
            span.style.opacity = '0';
            span.style.animation = 'trackingInContract 1.2s forwards';
            container.appendChild(span);
            
            setTimeout(play, (1.2 * 1000) + 2500);
        }
        play();
    </script>
</body>
</html>

===

## 054

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Spotlight Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Spotlight Sweep";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = `<span style="background: linear-gradient(to right, #333 0%, #fff 50%, #333 100%); background-size: 200% auto; color: transparent; -webkit-background-clip: text; background-clip: text; animation: spotlightSweep 2s linear forwards;">${text}</span>`;
            
            setTimeout(play, 2500 + 2000);
        }
        play();
    </script>
</body>
</html>

===

## 055

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Terminal Type Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "init system...";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = `<span id="ct-text"></span><span style="display:inline-block; width:10px; height:1.1em; background-color:white; margin-left:4px; vertical-align:middle; animation: blinkCursor 1s infinite;"></span>`;
            const textEl = document.getElementById('ct-text');
            const chars = text.split('');
            let i = 0;
            
            function type() {
                if (i < chars.length) {
                    textEl.textContent += chars[i];
                    i++;
                    setTimeout(type, 100);
                } else {
                    setTimeout(play, 2500);
                }
            }
            type();
        }
        play();
    </script>
</body>
</html>

===

## 056

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Skew In Up Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes skewInUp { 0% { transform: translateY(100%) skewY(20deg); opacity: 0; } 100% { transform: translateY(0) skewY(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Skewed Up Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'skewInUp 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 057

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Skew In Down Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes skewInDown { 0% { transform: translateY(-100%) skewY(-20deg); opacity: 0; } 100% { transform: translateY(0) skewY(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Skewed Down Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'skewInDown 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 058

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Skew In Left Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes skewInLeft { 0% { transform: translateX(-100%) skewX(30deg); opacity: 0; } 100% { transform: translateX(0) skewX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Skewed Left Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'skewInLeft 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 059

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Skew In Right Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes skewInRight { 0% { transform: translateX(100%) skewX(-30deg); opacity: 0; } 100% { transform: translateX(0) skewX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Skewed Right Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'skewInRight 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 060

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Unfold Vertical Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes unfoldV { 0% { transform: rotateX(-90deg); opacity: 0; } 100% { transform: rotateX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Unfolding Vertically";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'unfoldV 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 061

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Unfold Horizontal Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes unfoldH { 0% { transform: rotateY(-90deg); opacity: 0; } 100% { transform: rotateY(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Unfolding Horizontally";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'unfoldH 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 062

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Outline To Solid Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes outlineSolid { 0% { -webkit-text-stroke: 1px #fff; color: transparent; opacity: 0; } 50% { -webkit-text-stroke: 1px #fff; color: transparent; opacity: 1; } 100% { -webkit-text-stroke: 0px transparent; color: #fff; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Outline Becomes Solid";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'outlineSolid 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 063

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Solid To Outline Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes solidOutline { 0% { -webkit-text-stroke: 0px transparent; color: #fff; opacity: 0; } 50% { -webkit-text-stroke: 0px transparent; color: #fff; opacity: 1; } 100% { -webkit-text-stroke: 1px #fff; color: transparent; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Solid Fades To Outline";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'solidOutline 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 064

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Smoke In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes smokeIn { 0% { transform: translateY(-20px) scale(1.5); filter: blur(20px); opacity: 0; } 100% { transform: translateY(0) scale(1); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Appearing From Smoke";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'smokeIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 065

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Smoke Out Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes smokeOut { 0% { transform: translateY(0) scale(1); filter: blur(0); opacity: 1; } 100% { transform: translateY(-20px) scale(1.5); filter: blur(20px); opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Vanishing Into Smoke";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'smokeOut 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 066

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slot Drop Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slotDrop { 0% { transform: translateY(-300%); filter: blur(5px); opacity: 0; } 50% { transform: translateY(20%); filter: blur(2px); opacity: 1; } 100% { transform: translateY(0); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Slot Machine Drop";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slotDrop 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 067

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Elastic Scale Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes elasticScale { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.3); opacity: 1; } 80% { transform: scale(0.9); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Elastic Bouncy Scale";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'elasticScale 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 068

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Glitch RGB Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes glitchRGB { 0% { text-shadow: 2px 0 0 red, -2px 0 0 blue; opacity: 0; } 20% { text-shadow: -2px 0 0 red, 2px 0 0 blue; opacity: 1; } 40% { text-shadow: 2px 0 0 red, -2px 0 0 blue; } 60% { text-shadow: -2px 0 0 red, 2px 0 0 blue; } 80% { text-shadow: 1px 0 0 red, -1px 0 0 blue; } 100% { text-shadow: 0px 0 0 transparent; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "RGB Glitch Shift";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'glitchRGB 0.4s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (0.4 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 069

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Water Drop Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes waterDrop { 0% { transform: translateY(-100px) scale(0.1, 2); opacity: 0; } 50% { transform: translateY(0) scale(1.5, 0.5); opacity: 1; } 100% { transform: translateY(0) scale(1, 1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Water Drop Splashes";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'waterDrop 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 070

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Anti Gravity Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes antiGravity { 0% { transform: translateY(0); opacity: 0; } 50% { opacity: 1; transform: translateY(-20px); } 100% { transform: translateY(-50px); opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Floating Anti Gravity";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'antiGravity 2s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (2 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 071

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Falling Leaves Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes fallingLeaves { 0% { transform: translate(0, -50px) rotate(0deg); opacity: 0; } 50% { transform: translate(20px, 0) rotate(45deg); opacity: 1; } 100% { transform: translate(-20px, 50px) rotate(90deg); opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Leaves Falling Down";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'fallingLeaves 1.5s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (1.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 072

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Slingshot Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes slingshot { 0% { transform: translateZ(-500px) scale(0.1); opacity: 0; } 60% { transform: translateZ(100px) scale(1.2); opacity: 1; } 100% { transform: translateZ(0) scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Slingshot From Back";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'slingshot 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 073

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Giant Slide Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes giantSlide { 0% { transform: translateX(-200%) scale(3); opacity: 0; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Giant Sliding Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'giantSlide 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 074

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Staircase Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes staircase { 0% { transform: translateY(50px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Walking Up Stairs";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'staircase 0.5s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 075

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Shadow First Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes shadowFirst { 0% { text-shadow: 0 50px 20px rgba(255,255,255,0); opacity: 0; color: transparent; } 50% { text-shadow: 0 0 5px rgba(255,255,255,0.8); opacity: 1; color: transparent; } 100% { text-shadow: 0 0 0 rgba(255,255,255,0); color: #fff; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Shadows Appear First";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'shadowFirst 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 076

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Cube Flip X Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes cubeFlipX { 0% { transform: perspective(400px) rotateX(-90deg) translateZ(50px); opacity: 0; } 100% { transform: perspective(400px) rotateX(0deg) translateZ(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "3D Cube Flip X";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'cubeFlipX 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 077

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Cube Flip Y Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes cubeFlipY { 0% { transform: perspective(400px) rotateY(-90deg) translateZ(50px); opacity: 0; } 100% { transform: perspective(400px) rotateY(0deg) translateZ(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "3D Cube Flip Y";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'cubeFlipY 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 078

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Speed Dash Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes speedDash { 0% { transform: translateX(-200%) skewX(-45deg); opacity: 0; } 70% { transform: translateX(10%) skewX(-10deg); opacity: 1; } 100% { transform: translateX(0) skewX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "High Speed Dash";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'speedDash 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 079

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Heartbeat Burst Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes heartbeatBurst { 0% { transform: scale(0.5); opacity: 0; } 30% { transform: scale(1.2); opacity: 1; } 50% { transform: scale(0.9); opacity: 1; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Heartbeat Pumping";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'heartbeatBurst 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 080

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Movie Credits Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes movieCredits { 0% { transform: translateY(50px); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(-50px); opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Rolling Movie Credits";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'movieCredits 2s forwards';
                span.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.1 * 1000) + (2 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 081

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Springy Text Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes springyText { 0% { transform: scaleY(0); transform-origin: bottom; opacity: 0; } 50% { transform: scaleY(1.5); opacity: 1; } 75% { transform: scaleY(0.8); } 100% { transform: scaleY(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Bouncing Spring";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'springyText 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 082

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flip Bounce Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flipBounce { 0% { transform: perspective(400px) rotateX(90deg); opacity: 0; } 50% { transform: perspective(400px) rotateX(-20deg); opacity: 1; } 75% { transform: perspective(400px) rotateX(10deg); opacity: 1; } 100% { transform: perspective(400px) rotateX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flipping & Bouncing";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flipBounce 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 083

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Rotate 3D In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes rotate3DIn { 0% { transform: perspective(500px) rotate3d(1, 1, 1, 90deg); opacity: 0; } 100% { transform: perspective(500px) rotate3d(0, 0, 0, 0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Complex 3D Rotation";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'rotate3DIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 084

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Squeeze Expand Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes squeezeExpand { 0% { letter-spacing: -0.5em; opacity: 0; transform: scaleY(0.1); } 50% { letter-spacing: 0.2em; transform: scaleY(1.2); opacity: 1; } 100% { letter-spacing: 0.05em; transform: scaleY(1); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Squeeze & Expand";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'squeezeExpand 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 085

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Zip In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes zipIn { 0% { transform: scale(0); opacity: 0; } 80% { transform: scale(1.1) rotate(10deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Zipping In Fast";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'zipIn 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 086

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Blur Drop Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes blurDrop { 0% { transform: translateY(-50px); filter: blur(10px); opacity: 0; } 100% { transform: translateY(0); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Blurry Dropping";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'blurDrop 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 087

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Blur Rise Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes blurRise { 0% { transform: translateY(50px); filter: blur(10px); opacity: 0; } 100% { transform: translateY(0); filter: blur(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Blurry Rising";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'blurRise 0.6s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.6 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 088

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Swing In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes swingIn { 0% { transform: rotateX(-100deg); transform-origin: top; opacity: 0; } 100% { transform: rotateX(0deg); transform-origin: top; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Swinging Sign In";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'swingIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 089

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Swing Out Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes swingOut { 0% { transform: rotateX(0deg); transform-origin: top; opacity: 1; } 100% { transform: rotateX(-100deg); transform-origin: top; opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Swinging Sign Out";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'swingOut 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 090

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Pendulum Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes pendulum { 0% { transform: rotate(10deg); transform-origin: top; opacity: 0; } 50% { transform: rotate(-5deg); transform-origin: top; opacity: 1; } 100% { transform: rotate(0deg); transform-origin: top; opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Swinging Pendulum";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'pendulum 1s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 091

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Pulse Neon Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes pulseNeon { 0%, 100% { text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 20px #0ff; opacity: 1; } 50% { text-shadow: 0 0 2px #fff, 0 0 5px #fff, 0 0 10px #0ff; opacity: 0.5; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Pulsing Neon Tube";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'pulseNeon 1.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 092

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flip In X Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flipInX { 0% { transform: perspective(400px) rotateX(90deg); opacity: 0; } 100% { transform: perspective(400px) rotateX(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Simple Flip X";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flipInX 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 093

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flip In Y Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flipInY { 0% { transform: perspective(400px) rotateY(90deg); opacity: 0; } 100% { transform: perspective(400px) rotateY(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Simple Flip Y";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flipInY 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 094

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Boomerang Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes boomerang { 0% { transform: translateZ(-500px) rotate(45deg); opacity: 0; } 50% { transform: translateZ(100px) rotate(-10deg); opacity: 1; } 100% { transform: translateZ(0) rotate(0deg); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Boomerang Return";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'boomerang 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 095

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Space In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes spaceIn { 0% { transform: scale(0.2) translateZ(-1000px); opacity: 0; } 100% { transform: scale(1) translateZ(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Deep Space Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'spaceIn 1s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 096

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Perspective In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes perspectiveIn { 0% { transform: perspective(800px) translateZ(300px); opacity: 0; } 100% { transform: perspective(800px) translateZ(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Perspective Pop";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'perspectiveIn 0.8s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.8 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 097

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Expand Forward Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes trackingInExpandFwd { 0% { letter-spacing: -0.5em; transform: translateZ(-700px); opacity: 0; } 100% { letter-spacing: 0.05em; transform: translateZ(0); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Tracking Expand Fwd";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = text;
            span.style.opacity = '0';
            span.style.animation = 'trackingInExpandFwd 1s forwards';
            container.appendChild(span);
            
            setTimeout(play, (1 * 1000) + 2500);
        }
        play();
    </script>
</body>
</html>

===

## 098

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Contract Back Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes trackingOutContractBck { 0% { letter-spacing: 0.05em; transform: translateZ(0); opacity: 1; } 100% { letter-spacing: -0.5em; transform: translateZ(-500px); opacity: 0; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Tracking Contract Bck";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = text;
            span.style.opacity = '0';
            span.style.animation = 'trackingOutContractBck 1s forwards';
            container.appendChild(span);
            
            setTimeout(play, (1 * 1000) + 2500);
        }
        play();
    </script>
</body>
</html>

===

## 099

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Text Shadow Pop Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes textShadowPop { 0% { text-shadow: 0 0 #555, 0 0 #555; transform: translateX(0) translateY(0); opacity: 0; } 100% { text-shadow: 1px 1px #555, 2px 2px #555, 3px 3px #555, 4px 4px #555; transform: translateX(-4px) translateY(-4px); opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Shadow Popping Out";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'textShadowPop 0.5s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (0.5 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>

===

## 100

<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Flicker In Effect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0a0a0a;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-size: 3rem;
            font-weight: 300;
            letter-spacing: 0.05em;
        }
        .char {
            display: inline-block;
            white-space: pre;
        }
        @keyframes flickerIn { 0% { opacity: 0; } 10% { opacity: 1; } 20% { opacity: 0; } 30% { opacity: 1; } 40% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div id="anim-container"></div>
    <script>
        const text = "Flickering Reveal";
        const container = document.getElementById('anim-container');
        
        function play() {
            container.innerHTML = '';
            const chars = text.split('');
            chars.forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'char';
                span.style.opacity = '0';
                span.style.animation = 'flickerIn 1.2s forwards';
                span.style.animationDelay = `${index * 0.05}s`;
                container.appendChild(span);
            });
            
            const totalTime = (chars.length * 0.05 * 1000) + (1.2 * 1000) + 2500;
            setTimeout(play, totalTime);
        }
        play();
    </script>
</body>
</html>