const weekNr = 18;
loggedInUser = ""

logout()

document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get the user's input
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;

    // Check if the credentials are valid
    fetch('users.json')
        .then(response => response.json())  // Parse the JSON data
        .then(users => {
            const isNotRandomUser = users.find(user => user.name.toLowerCase() === name.toLowerCase());
            const randomUser = users.find(user => user.name.toLowerCase() === name.toLowerCase() && user.x !== null);
            const user = users.find(user => user.name.toLowerCase() === name.toLowerCase() && user.password === password);
            loggedInUser = user;

            if (user) {
                // If user found, show personalized content
                fetch('secret_santas.json')
                    .then(response => response.json())  // Parse the JSON data
                    .then(async santas => {
                        const santa = santas.find(santa => santa.santa.toLowerCase() === name.toLowerCase());

                        document.getElementById('realContent').style.display = 'block';
                        document.getElementById('userName').textContent = user.name;
                        document.getElementById('error').style.display = 'none';
                        document.getElementById('randomError').style.display = 'none';
                        document.getElementById('loginForm').style.display = 'none';
                        await openPrayersMenu()
                    })
                    .catch(error => console.error('Error fetching santa data:', error));
            } else {
                if (randomUser) {
                    alert("ERROR 404")
                } else {
                    if (!isNotRandomUser) {
                        document.getElementById('randomError').style.display = 'block';
                        document.getElementById('error').style.display = 'none';
                        document.getElementById('welcome').style.display = 'none';
                    }
                    else {
                        // If credentials are invalid, show error message
                        document.getElementById('error').style.display = 'block';
                        document.getElementById('randomError').style.display = 'none';
                        document.getElementById('welcome').style.display = 'none';
                    }
                }
            }
        })
        .catch(error => console.error('Error fetching user data:', error));
});

function base64ToUtf8(base64Str) {
    return decodeURIComponent(escape(atob(base64Str)));  // Decode from Base64
}

// Check if user is already logged in (using localStorage)
window.onload = function() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    const loggedSanta = localStorage.getItem('loggedSanta');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        document.getElementById('welcome').style.display = 'block';
        document.getElementById('userName').textContent = user.name;
        document.getElementById('error').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
    }
    if (loggedSanta) {
        const santa = JSON.parse(loggedSanta);
        document.getElementById('toName').textContent = base64ToUtf8(santa.name);
    }
};

// Handle Logout
document.getElementById('logoutButton')?.addEventListener('click', function() {
    logout()
});

function logout() {
    // Remove user data from localStorage
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('loggedSanta');
    // Hide welcome message and show login form
    document.getElementById('randomWelcome').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('randomError').style.display = 'none';
    document.getElementById('password').textContent = null;

    document.getElementById('realContent').style.display = 'none';
    document.getElementById('randomContent').style.display = 'block';
    document.getElementById('prayersContent').style.display = 'none';
    document.getElementById('prayerMenu').style.display = 'block';

    document.getElementById('randomMenu').classList.add("active")
    document.getElementById('prayerMenu').classList.remove("active")
    document.getElementById('pdfCanvas').style.display = 'none'
    document.getElementById("openPDFButtonDiv").style.display = "none";

}

document.getElementById('randomMenu')?.addEventListener('click', function() {
    document.getElementById('randomMenu').classList.add("active")
    document.getElementById('prayerMenu').classList.remove("active")
    document.getElementById('randomContent').style.display = 'block';
    document.getElementById('prayersContent').style.display = 'none';
    document.getElementById('pdfCanvas').style.display = 'none';
    document.getElementById("openPDFButtonDiv").style.display = "none";
});

document.getElementById('prayerMenu')?.addEventListener('click', async function () {
    await openPrayersMenu()
});

async function openPrayersMenu() {
    document.getElementById("openPDFButtonDiv").style.display = "none";
    document.getElementById('prayerMenu').classList.add("active")
    document.getElementById('randomMenu').classList.remove("active")
    document.getElementById('prayersContent').style.display = 'block';
    document.getElementById('randomContent').style.display = 'none';

    setPrayers()
    await loadPDF(`prayer/${loggedInUser.name}/Nädal ${weekNr}.pdf`)
}

function setPrayers(){
    const prayersList = document.getElementById('prayersList');
    prayersList.innerHTML = '';
    let lastButton;

    for (let i = 1; i <= weekNr; i++) {
        if (i > 1 && i % 9 === 1) {
            prayersList.appendChild(document.createElement('hr'));
        }
        let button = document.createElement('button');
        button.textContent = `Sedel ${i}`;
        button.classList.add("prayerWeekButton");
        button.id = `prayerWeekButton${i}`
        button.addEventListener('click', async () => {
            await loadPDF(`prayer/${loggedInUser.name}/Nädal ${i}.pdf`)
            for (let j = 1; j <= weekNr; j++) {
                document.getElementById(`prayerWeekButton${j}`).classList.remove("active")
            }
            document.getElementById(`prayerWeekButton${i}`).classList.add("active")
        });
        prayersList.appendChild(button);
        lastButton = button;
    }
    lastButton.classList.add("active")
}

async function loadPDF(fileURL){
    const canvas = document.createElement('canvas');

    const ctx = canvas.getContext('2d');

    // PDF.js setup
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    // Load PDF and render the first page
    const pdf = await pdfjsLib.getDocument(fileURL).promise;
    const page = await pdf.getPage(1); // Get the first page

    // Set canvas dimensions to fit the PDF page
    const viewport = page.getViewport({ scale: 3.5 }); // Scale for better quality
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page to the canvas
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
    };
    await page.render(renderContext).promise;

    // Adjust contrast after rendering
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const contrast = 100; // Adjust contrast level as needed
    const adjustedImageData = adjustContrast(imageData, contrast);
    ctx.putImageData(adjustedImageData, 0, 0);

    replaceCanvasClicks(canvas);
    removeButtonClicks()

    if (isMobile()) {
        document.getElementById("openPDFButtonDiv").style.display = "block";
        document.getElementById("openPDFButton").addEventListener('click', function() {
            open(fileURL);
        })
    } else {
        document.getElementById("openPDFButtonDiv").style.display = "none";
        canvas.addEventListener('click', function() {
            open(fileURL);
        })
    }

    document.getElementById('pdfCanvas').style.display = 'block'
}

function adjustContrast(imageData, contrast) {
    const data = imageData.data;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        data[i] = factor * (data[i] - 128) + 128;     // Red
        data[i + 1] = factor * (data[i + 1] - 128) + 128; // Green
        data[i + 2] = factor * (data[i + 2] - 128) + 128; // Blue
        // Alpha (data[i + 3]) remains unchanged
    }

    return imageData;
}

function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function replaceCanvasClicks(canvas) {
    const canvasDiv = document.getElementById('canvasDiv');
    const oldCanvas = document.getElementById('pdfCanvas');
    oldCanvas.remove();

    canvas.id = "pdfCanvas";
    canvasDiv.appendChild(canvas)
}

function removeButtonClicks() {
    const buttonDiv = document.getElementById('openPDFButtonDiv');
    const oldButton = document.getElementById('openPDFButton');
    oldButton.remove();

    let button = document.createElement("button");
    button.id = "openPDFButton";
    button.innerHTML = "Ava sedel täisvaates"
    buttonDiv.appendChild(button)
}


function test(username, password) {
    let n = document.getElementById('name');
    let p = document.getElementById('password');

    n.innerText = username;
    p.innerText = password;
}