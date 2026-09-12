const character = document.getElementById('character');
const obstacle = document.getElementById('obstacle');
const floor = document.getElementById('floor');
const game = document.getElementById('game');
const score_board = document.getElementById('scoreBoard');
const best_score_board = document.getElementById('bestScoreBoard');
const game_start = document.getElementById('game-start');

let isJumping = false;
let gameRunning = false;
let score = 0;
let best_score = 0;

const p_width = 28;
const p_height = 38;
let o_width = 18;
let o_height = 18;
const jump_height = 80;
let speed_param = 1.3;
const speed = 24;
let floor_height = 6;
let new_floor_height = 6;
let level = 1;

if (character) {
    character.style.width = `${p_width}px`;
    character.style.height = `${p_height}px`;
}

if (obstacle) {
    obstacle.style.width = `${o_width}px`;
    obstacle.style.height = `${o_height}px`;
}

function updateScoreDisplay() {
    if (score_board) {
        score_board.innerText = Math.round(score);
    }
    if (best_score_board) {
        best_score_board.innerText = Math.round(best_score);
    }
}

function saveBestScore() {
    const userName = typeof appState !== 'undefined' ? appState.currentUser?.name : ''; 
    // Submit every completed run: local records are not proof of a server save.
    window.dispatchEvent(new CustomEvent('bjk-best-score', {
        detail: { user: userName, score }
    }));
}

function jump() {
    if (!game || !character || isJumping) return;
    isJumping = true;
    let jumpHeight = 0;
    const jumpInterval = setInterval(() => {
        if (gameRunning) {
            if (jumpHeight >= jump_height) {
                clearInterval(jumpInterval);
                const fallInterval = setInterval(() => {
                    if (jumpHeight <= 0 || !gameRunning) {
                        clearInterval(fallInterval);
                        isJumping = false;
                    } else {
                        jumpHeight -= 5.2 * speed_param;
                        character.style.bottom = `${floor_height + jumpHeight}px`;
                    }
                }, speed);
            } else {
                jumpHeight += 5.2 * speed_param;
                character.style.bottom = `${floor_height + jumpHeight}px`;
            }
        } else {
            clearInterval(jumpInterval);
            isJumping = false;
        }
    }, speed);
}

function setSkyMode(isNight) {
    if (!game) return;
    game.classList.toggle('night', isNight);
    game.style.setProperty('--cloud-opacity', isNight ? '0.45' : '0.8');
}

function updateSkyCycle() {
    if (!game) return;
    const cycle = Math.floor(score / 5000) % 2;
    setSkyMode(cycle === 1);
}

function moveObstacle() {
    if (!game || !obstacle) return;
    updateScoreDisplay();

    let obstaclePosition = game.offsetWidth;
    const obstacleInterval = setInterval(() => {
        if (!gameRunning) {
            obstaclePosition = game.offsetWidth;
        } else {
            changeFloor();
            fixPlayerHeight();
            updateScoreDisplay();

            if (obstaclePosition <= -o_width) {
                obstaclePosition = game.offsetWidth + getRandomInt(140, 320);
                score += Math.round((o_width * o_height) / 2 + 14);
                speed_param += 0.015;
                setObsParams();
                isLevelUp();
                updateSkyCycle();
            } else {
                obstaclePosition -= 4.8 * speed_param;
            }

            obstacle.style.left = `${obstaclePosition}px`;

            const characterBottom = parseInt(window.getComputedStyle(character).getPropertyValue('bottom'));
            const characterLeft = character.offsetLeft;
            const obstacleLeft = obstacle.offsetLeft;

            if (
                characterLeft < obstacleLeft + o_width * 0.75 &&
                characterLeft + p_width * 0.75 > obstacleLeft &&
                characterBottom < o_height + floor_height + 4
            ) {
                if (best_score < score) {
                    best_score = score;
                }
                saveBestScore();
                gameRunning = false;
                game.classList.remove('running');
                game.style.background = 'linear-gradient(180deg, #dfe8ef 0%, #f4f4ff 100%)';
                updateScoreDisplay();
                if (game_start) {
                    game_start.style.display = 'block';
                }
                score = 0;
                updateSkyCycle();
            }
        }
    }, speed);
}

function fixPlayerHeight() {
    if (!gameRunning || !character || isJumping) return;
    const characterBottom = parseInt(window.getComputedStyle(character).getPropertyValue('bottom'));

    if (characterBottom < floor_height) {
        character.style.bottom = `${characterBottom + 1}px`;
    } else if (characterBottom > floor_height) {
        character.style.bottom = `${characterBottom - 1}px`;
    }
}

function setObsParams() {
    if (!obstacle) return;
    o_width = getRandomInt(18, 46);
    o_height = getRandomInt(16, 34);

    obstacle.style.width = `${o_width}px`;
    obstacle.style.height = `${o_height}px`;
    obstacle.style.backgroundImage = `url(game/img/${getRandomInt(1, 10)}.png)`;
    obstacle.style.boxShadow = '0 6px 16px rgba(31, 41, 51, 0.25)';
}

function isLevelUp() {
    if (score / 1000 >= level) {
        level += 1;
        new_floor_height = getRandomInt(6, 24);
        setAllParam();
    }
}

function changeFloor() {
    if (!floor) return;
    if (parseInt(floor_height) !== parseInt(new_floor_height)) {
        if (floor_height > new_floor_height) {
            floor_height -= 1;
        } else {
            floor_height += 1;
        }
        setAllParam();
    }
}

function setAllParam() {
    if (!obstacle || !floor) return;
    obstacle.style.bottom = `${floor_height}px`;
    floor.style.height = `${floor_height}px`;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function restart() {
    if (!game || !obstacle || !game_start) return;
    obstacle.style.display = 'block';
    level = 1;
    floor_height = 6;
    obstacle.style.left = `${game.offsetWidth}px`;
    game_start.style.display = 'none';
    best_score = Number(typeof appState !== 'undefined' && appState.currentUser?.bestScore || 0);
    score = 0;
    speed_param = 1.3;
    updateScoreDisplay();
    updateSkyCycle();
    game.style.background = 'linear-gradient(180deg, #def4ff 0%, #eef8ff 100%)';
    game.classList.add('running');
    setTimeout(() => {
        setObsParams();
        gameRunning = true;
    }, 420);
}

if (game) {
    game.classList.remove('running');

    document.addEventListener('keydown', (event) => {
        if (!game.getClientRects().length || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
        if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
        event.preventDefault();
        if (gameRunning) {
            if (event.code === 'Space') {
                jump();
            }
        } else {
            restart();
        }
    });

    document.getElementsByTagName('body')[0].addEventListener('click', (event) => {
        if (gameRunning) {
            jump();
        }
    });

    game.addEventListener('click', () => {
        if (!gameRunning) {
            restart();
        }
    });

    obstacle.style.display = 'none';
    moveObstacle();
}
