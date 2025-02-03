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

const p_width = 20;
const p_height = 30;
let o_width = 10;
let o_height = 10;
const jump_height = 70;
let speed_param = 1;
const speed = 30;
let floor_height = 5;
let new_floor_height = 5;
let level = 1;

character.style.width = `${p_width}px`;
character.style.height = `${p_height}px`;
obstacle.style.width = `${o_width}px`;
obstacle.style.height = `${o_height}px`;

setObsParams();
restart();
obstacle.style.left = `${game.offsetWidth}px`;


// Character jump function
function jump() {
    if (isJumping) return;
    isJumping = true;
    let jumpHeight = 0;
    let startPos = floor_height;
    const jumpInterval = setInterval(() => {
        if (gameRunning) {
            if (jumpHeight >= jump_height) {
                clearInterval(jumpInterval);
                const fallInterval = setInterval(() => {
                    if (jumpHeight<= 0 || !gameRunning) {
                        clearInterval(fallInterval);
                        isJumping = false;
                    } else {
                        jumpHeight -= 4 * speed_param;
                        character.style.bottom = `${floor_height + jumpHeight}px`;
                    }
                }, speed);
            } else {
                jumpHeight += 4 * speed_param;
                character.style.bottom = `${floor_height + jumpHeight}px`;
            }
        } else {
            jumpHeight = 0;
            clearInterval(jumpInterval);
            isJumping = false;
        }
    }, speed);
}

// Move obstacle
function moveObstacle() {
    score_board.innerText = score;
    best_score_board.innerText = best_score;

    let obstaclePosition = game.offsetWidth;
    const obstacleInterval = setInterval(() => {
        if (!gameRunning) {
            obstaclePosition = game.offsetWidth;
        } else {
            changeFloor();
            fixPlayerHeight();
            score_board.innerText = score;
            best_score_board.innerText = best_score;

            if (obstaclePosition <= -o_width) {
                obstaclePosition = game.offsetWidth + getRandomInt(0, game.offsetWidth * 2);
                score += o_width * o_height;
                speed_param += 0.01;
                setObsParams();
                isLevelUp();
            } else {
                obstaclePosition -= 4 * speed_param;
            }

            obstacle.style.left = `${obstaclePosition}px`;

            // Collision detection
            const characterBottom = parseInt(window.getComputedStyle(character).getPropertyValue('bottom'));
            const characterLeft = character.offsetLeft;
            const obstacleLeft = obstacle.offsetLeft;

            if (
                characterLeft < obstacleLeft + o_width * 0.7 && // Character's right edge past obstacle's left edge
                characterLeft + p_width * 0.7 > obstacleLeft && // Character's left edge before obstacle's right edge
                characterBottom < o_height + floor_height
            ) {
                if (best_score < score) {
                    best_score = score;
                }
                gameRunning = false;
                game.style.background = "#a4a4a4";
                score_board.innerText = score;
                best_score_board.innerText = best_score;
                game_start.style.display = 'block';
                score = 0;
            }

        }
    }, speed);
}


function fixPlayerHeight() {
    if (gameRunning && !isJumping) {
        const characterBottom = parseInt(window.getComputedStyle(character).getPropertyValue('bottom'));

        if (characterBottom < floor_height) {
            character.style.bottom = `${characterBottom + 1}px`;
        } else if (characterBottom > floor_height) {
            character.style.bottom = `${characterBottom - 1}px`;
        }
    }
}

function setObsParams() {
    o_width = getRandomInt(15, 40);
    o_height = getRandomInt(10, 30);

    obstacle.style.width = `${o_width}px`;
    obstacle.style.height = `${o_height}px`;
    obstacle.style.backgroundImage = `url(game/img/${getRandomInt(1, 10)}.png)`;
}

function isLevelUp() {
    if (score / 1000 >= level) {
        level += 1;
        new_floor_height = getRandomInt(2, 30);
        // animateFloorChange(floor_height, new_floor_height);
        // floor_height = new_floor_height;
        setAllParam();
    }
}

function animateFloorChange(old_h, new_h) {
    let i = 0;
    const anim = setInterval(() => {
        if (i >= 10) {
            clearInterval(anim);
        }
        if (gameRunning) {
            if (i % 2 === 0) {
                floor.style.height = `${new_h}px`;
            } else {
                floor.style.height = `${old_h}px`;
            }
        }
        i += 1;
    }, speed);

}

function changeFloor() {
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
    obstacle.style.bottom = `${floor_height}px`;
    // character.style.bottom = `${floor_height}px`;
    floor.style.height = `${floor_height}px`;
}

function getRandomInt(min, max) {
    min = Math.ceil(min); // Round up to the nearest whole number
    max = Math.floor(max); // Round down to the nearest whole number
    return Math.floor(Math.random() * (max - min + 1)) + min; // Generate random number
}


// Start game
document.addEventListener('keydown', (e) => {
    if (gameRunning) {
        if (e.code === 'Space') {
            jump();
        }
    } else {
        restart();
    }
});

document.getElementsByTagName('body')[0].addEventListener('click', (e) => {
    if (gameRunning) {
        jump();
    }
});
document.getElementById('game').addEventListener('click', (e) => {
    if (!gameRunning) {
        restart();
    }
});

function restart() {
    level = 1;
    floor_height = 5;
    obstacle.style.left = `${game.offsetWidth}px`;
    // character.style.bottom = `${floor_height}px`;
    game_start.style.display = 'none';
    score_board.innerText = score;
    best_score_board.innerText = best_score;
    game.style.background = "#ddd";
    speed_param = 1;
    setTimeout(() => {
        setObsParams();
        gameRunning = true;
    }, 1000);
}


moveObstacle();
