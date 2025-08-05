let q = await Q5.WebGPU();

// get url params for stage
let urlParams = new URLSearchParams(window.location.search);
let stageParam = urlParams.get('stage');

let stage = stageParam || 0;
let line = 0;
let showDialog = true;
let autoDialog = 500;

createCanvas();
displayMode(MAXED, PIXELATED);
noStroke();

world.gravity.y = 10;

let fast_traffic = loadAudio('sounds/fast_traffic.ogg');
let slow_traffic = loadAudio('sounds/slow_traffic.ogg');
let pete_holmes_bit, traffic_jam, train_flyby;

let explosionsSounds = [];
for (let i = 2; i <= 3; i++) {
	for (let j = 0; j <= 4; j++) {
		let explosion = loadSound(`sounds/Explosion${i}__00${j}.ogg`);
		explosion.volume = 0.8;
		explosionsSounds.push(explosion);
	}
}

for (let i = 0; i <= 4; i++) {
	explosionsSounds.push(loadSound(`sounds/explosionCrunch_00${i}.ogg`));
}

let crash = loadSound('sounds/car_crash.ogg');

let dia = loadJSON('dialog.json');

await load('fonts/Kenney_Rocket_Square.ttf');

fill(1);
textAlign(CENTER, CENTER);
textSize(width / 8);
textImage('loading...', 0, 0);

rect(-halfWidth, -halfHeight, width * 0.1, 32);

await delay(1000);

let cur = new Sprite();
cur.w = 16;
cur.h = 16;
cur.physics = KINEMATIC;
cur.visible = false;
cur.removeColliders();
cur.layer = -1;
cur.spriteSheet = 'assets/cursors.png';
cur.anis.cutFrames = true;
cur.addAnis({
	wait0: [10, 0],
	wait1: [11, 0],
	wait2: [12, 0],
	dialog0: [10, 2],
	dialog1: [10, 1],
	grab: [15, 6],
	grabbing: [15, 7],
	pointer: [17, 6],
	crosshair: [17, 2],
	default: [6, 1]
});
window.cur = cur;

// cut frames from sprite sheets into separate images
// to avoid pixel bleeding from other frames
allSprites.anis.cutFrames = true;
allSprites.autoCull = false;
allSprites.gravityScale = 0;

let atlas = await load('assets/traffic_atlas.xml');
atlas = parseTextureAtlas(atlas);

rect(-halfWidth, -halfHeight, width * 0.3, 32);

allSprites.spriteSheet = await load('assets/traffic.png');
allSprites.addAnis(atlas);

rect(-halfWidth, -halfHeight, width * 0.5, 32);

let emoteAtlas = await load('assets/emotes_atlas.xml');
emoteAtlas = parseTextureAtlas(emoteAtlas);

rect(-halfWidth, -halfHeight, width * 0.6, 32);

let emotes = new Group();
emotes.spriteSheet = 'assets/emotes.png';
emotes.anis.cutFrames = true;
emotes.addAnis(emoteAtlas);
emotes.physics = 'none';
emotes.scale = 6;

let carAnis = Object.keys(allSprites.anis).slice(0, 42);

let cars = new Group();
// cars.scale = 4;
cars.rotationLock = true;
cars.overlap(cars);
window.cars = cars;

let player = new Sprite('formula');
player.scale = 6;
player.removeColliders();
player.addAni('train', 'assets/train.png');
window.player = player;

let lanesPerRoadway = stage <= 3 ? 5 : stage != 6 ? 9 : 3;
let carsPerLane = stage <= 3 ? 20 : stage != 6 ? 15 : 25;
let topLaneY = -25;
let bottomLaneY = 190;

window.lanes = [];

let marks = new Group();
marks.w = 64;
marks.h = 64;
marks.physics = 'none';
marks.life = 90;
marks.rotationSpeed = () => random(-5, 5);
marks.addAni('assets/crosshairs.png', { frames: 200 });
marks.scale = 2;
marks.layer = 999;

let markedCars = [];

let smokes = new Group();
smokes.w = 256;
smokes.h = 256;
smokes.physics = 'none';
smokes.life = 10;
smokes.addAni('assets/smokes.png', { frames: 9 });

rect(-halfWidth, -halfHeight, width * 0.8, 32);

// distance from player to recycle cars
let recycleThreshold = 1200;
let cursorWaitIdx = 0;

let grabPower = false;
let grabCar;
let grabbedCars = 0;

let bombPower = stage == 3;
let bombedCars = 0;

let hillBaseY = 0;
let hillSize = 600;
let noiseScale = 0.1;
let hill2OffsetY = 40;
let hill2OffsetX = 20;
let textY = -200;

let stickLockout = true;
let mouseControlsEnabled = true;

let fader = 1;
let riser = 0;

q.setup = () => {
	// lazy load since this audio isn't used in the first stage
	pete_holmes_bit = loadAudio('sounds/pete_holmes_bit.mp3');
	traffic_jam = loadAudio('sounds/traffic_jam.ogg');
	train_flyby = loadAudio('sounds/train_flyby.ogg');

	if (stage <= 4) {
		fast_traffic.volume = 0.6;
		slow_traffic.volume = 0.6;
	} else {
		fast_traffic.volume = 0.2;
		slow_traffic.volume = 0.2;
	}
	if (stage == 6) {
		traffic_jam.currentTime = 104;
	}
	traffic_jam.volume = 0.9;
	fast_traffic.loop = true;
	slow_traffic.loop = true;
	train_flyby.loop = true;

	if (stage == 0) player.changeAni('station');
	else if (stage == 6) player.changeAni('train');
	else player.changeAni('formula');

	createLanes();

	if (stage == 3) startStage3();
};

function createLanes() {
	for (let i = 0; i < lanesPerRoadway * 2; i++) {
		let lane = new cars.Group();
		lanes.push(lane);
		let dir = (lane.dir = i < lanesPerRoadway ? 1 : -1);
		lane.y = (i % lanesPerRoadway) * 20 + (i < lanesPerRoadway ? topLaneY : bottomLaneY);
		lane.scale = 6;

		let carPos = dir == 1 ? halfWidth : 1600;
		for (let j = 0; j < carsPerLane; j++) {
			let car;
			if (i != 4 || j != carsPerLane - 5) {
				car = new lane.Sprite(random(carAnis));
			} else {
				if (stage == 6) continue;
				// insert player car
				car = player;
			}
			carPos -= car.w + random(100, 300);
			car.x = carPos;
			car.y = lane.y - car.h / 2 + int(random(-1, 1));
			car.scale.x *= dir;
			car.dir = dir;
			car.lane = i;
			car.idxInLane = j;
			car.layer = i * carsPerLane + (dir === 1 ? carsPerLane - j : j);
			car.minGap = random(20, 150);
			car.maxGap = random(50, 150);
			car.lookAhead = int(random(1, 4));
			car.accel = car.w > 150 ? 0.01 : 0.02;
			car.decel = car.w > 150 ? 0.01 : 0.02;
			car.vel.x = dir == 1 ? random(2, 3) : -1;
			car.removeColliders();
		}
	}

	player.dir = 1;
	player.lane = 4;
	player.y = player.targetY = lanes[4].y - player.hh - (!stage ? 5 : 1);
	player.idxInLane = undefined; // not in lane array yet
	if (stage != 6) {
		insertInLane(player, player.lane);
		player.vel.x = 2.6;
	} else {
		player.y = player.targetY = 60;
		player.vel.x = 20;
	}
}

function isLaneOpen(car, targetLaneIdx) {
	let lane = lanes[targetLaneIdx];
	for (let o of lane) {
		// Check horizontal overlap (x) only
		let dx = Math.abs(car.x - o.x);
		let minDistX = car.hw + o.hw;
		if (dx < minDistX) {
			return false; // lane is blocked
		}
	}
	return true; // lane is open
}

function insertInLane(car, targetLaneIdx, targetIdx) {
	let targetLane = lanes[targetLaneIdx];
	let dir = targetLane.dir;
	let idx;

	if (targetIdx !== undefined) {
		idx = targetIdx;
	} else {
		if (dir === 1) {
			// Insert in ascending x order
			idx = targetLane.findIndex((other) => car.x >= other.x);
		} else {
			// Insert in descending x order
			idx = targetLane.findIndex((other) => car.x <= other.x);
		}
		if (idx == -1) idx = targetLane.length;
	}

	// already in the correct position
	if (car.lane == targetLaneIdx && idx == car.idxInLane) return;

	let curLane = lanes[car.lane];

	if (car.idxInLane != undefined) {
		curLane.splice(car.idxInLane, 1);
	}
	targetLane.splice(idx, 0, car);

	// Reset idxInLane for all cars behind the inserted car
	for (let i = 0; i < curLane.length; i++) {
		curLane[i].idxInLane = i;
	}
	for (let i = 0; i < targetLane.length; i++) {
		targetLane[i].idxInLane = i;
	}

	car.lane = targetLaneIdx;
	car.layer = car.lane * carsPerLane + (dir === 1 ? carsPerLane - idx : idx);

	if (car.dir != dir) {
		car.dir = dir;
		car.scale.x *= -1; // flip car direction
		car.vel.x *= -1; // reverse velocity
	}
}

function removeFromLane(car) {
	const lane = lanes[car.lane];
	if (!lane) return;
	const idx = car.idxInLane;
	if (idx != undefined && idx >= 0 && idx < lane.length && lane[idx] === car) {
		lane.splice(idx, 1);
		// Reset idxInLane for all cars in the lane
		for (let i = 0; i < lane.length; i++) {
			lane[i].idxInLane = i;
		}
	}
	car.lane = undefined;
	car.idxInLane = undefined;
}

function changeToClosestLane(car) {
	// Find the closest lane by y position
	let closestLaneIdx = 0;
	let minDist = Infinity;
	for (let i = 0; i < lanes.length; i++) {
		let laneY = lanes[i].y;
		let dist = Math.abs(car.y + car.hh - laneY);
		if (dist < minDist) {
			minDist = dist;
			closestLaneIdx = i;
		}
	}
	insertInLane(car, closestLaneIdx);
}

async function bombCar(car) {
	car.wasMarked = true;
	markedCars.push(car);
	let mark = new marks.Sprite();
	mark.physics = 'none'; // bug: shouldn't be necessary
	mark.car = car;
	mark.ani.frame = int(random(mark.ani.length));
	mark.ani.pause();

	await delay(1000 / world.timeScale);
	if (!bombPower) return;
	let laneIdx = car.lane;
	removeFromLane(car);
	car.gravityScale = 1;
	car.rotationLock = false;
	car.speed = random(10, 20);
	car.direction = random(-135, -45);
	car.rotationSpeed = random(-10, 10);
	bombedCars++;
	let explode = random(explosionsSounds);
	explode.play();

	let smoke = new smokes.Sprite(car.x, car.y);
	smoke.ani.frame = int(random(smoke.ani.length));
	// smoke.ani.pause();

	await delay(5000 / world.timeScale);
	if (!bombPower) return;
	if (line >= 8) return;
	// recycle the car
	car.gravityScale = 0;
	car.speed = 0;
	car.rotationSpeed = 0;
	car.rotation = 0;
	car.rotationLock = true;
	car.lane = laneIdx;
	car.x = -100000; // move off-screen
	let lane = lanes[laneIdx];
	car.y = lane.y - car.hh - 1;
	car.wasMarked = false;
	markedCars.splice(markedCars.indexOf(car), 1);
	insertInLane(car, laneIdx, lane.length - 1);
}

function updateCars() {
	for (let i = 0; i < lanes.length; i++) {
		let lane = lanes[i];
		let dir = lane.dir;
		let start = dir == 1 ? 1 : lane.length - 2;
		let end = dir == 1 ? lane.length : -1;
		let step = dir == 1 ? 1 : -1;

		for (let j = start; j != end; j += step) {
			let car = lane[j];
			if (car === player && stage != 4) continue;
			let carAhead = lane[j - step];
			let gap = dir === 1 ? carAhead.x - car.x - (carAhead.hw + car.hw) : car.x - carAhead.x - (car.hw + carAhead.hw);

			// Simulate reaction delay
			if (car.reactionTimer > 0) {
				car.reactionTimer--;
			} else {
				let sum = 0,
					count = 0;
				for (let k = 1; k <= car.lookAhead; k++) {
					let idx = j - k * step;
					if (idx < 0 || idx >= lane.length) break;
					sum += lane[idx].vel.x;
					count++;
				}
				let avgSpeed = count > 0 ? sum / count : carAhead.vel.x;
				let error = dir * random(0, 0.25);
				car.desiredSpeed = avgSpeed + error;
				car.reactionTimer = int(random(60, 120));
			}

			if (car.vel.x === 0) {
				if (gap > car.maxGap) {
					car.vel.x = dir * Math.min(car.accel, (gap - car.maxGap) * 0.005);
				}
			} else if (gap < car.minGap) {
				if (gap > 10 && car.vel.x * dir > 0) {
					if (Math.abs(car.vel.x) < 0.5) car.vel.x -= dir * 0.05;
					else {
						let requiredDecel = (car.vel.x * car.vel.x) / (2 * gap);
						car.vel.x -= dir * requiredDecel;
					}
					if (Math.abs(car.vel.x) < 0.01) car.vel.x = 0;
				} else {
					car.vel.x = 0;
				}
			} else {
				if (car.vel.x * dir < car.desiredSpeed * dir) {
					car.vel.x += dir * Math.min(car.accel, (gap - car.minGap) * 0.005);
				} else if (car.vel.x * dir > car.desiredSpeed * dir) {
					car.vel.x -= dir * Math.min(car.decel, Math.abs(car.vel.x - car.desiredSpeed) * 0.05);
				}
			}

			// Car recycling logic
			if (car.x < player.x - recycleThreshold && !car.isMarked) {
				let laneIdx = car.lane;
				removeFromLane(car);
				car.lane = laneIdx;

				// Place recycled car just in front or behind the right most car
				let rightMostCar = lane[0];
				let offset = dir == 1 ? random(100, 300) : 200;
				car.x = rightMostCar.x + rightMostCar.hw + car.hw + offset;
				car.vel.x = dir == 1 ? random(2, 3) : -1;
				insertInLane(car, car.lane, 0);
				j -= step; // adjust index since we removed the car
			}
		}
	}

	if (!lanes.length || player.wasMarked) return;

	player.carAhead = lanes[player.lane][player.idxInLane - 1];

	if (player.carAhead) {
		// automatic braking
		let distance = player.carAhead.x - player.x - (player.carAhead.hw + player.hw);
		if (distance < -15 && player.vel.x > player.carAhead.vel.x) {
			player.vel.x -= 1; // brake
		}

		if (player.overlaps(player.carAhead)) crash.play();
	}
}

function dialog() {
	if (showDialog) {
		autoDialog--;
		if (((mouse.presses() || kb.presses(' ') || contro.presses('a')) && autoDialog > 40) || autoDialog <= 0) {
			autoDialog = 240;
			if (line < dia[stage].length - 1) line++;
			else {
				// end of dialog for the current stage
				line = -1;
				showDialog = false;
			}

			// dialog line based events
			if (stage == 0) {
				if (line == 4) {
					player.changeAni('formula');
					player.targetY = lanes[player.lane].y - player.hh - 1;
				}
				if (line > 5) autoDialog = 60;
			}

			if (stage == 1) {
				if (line == 3) grabPower = true;
			}

			if (stage == 2) {
				grabPower = false;
				if (line == 3) bombPower = true;
			}

			if (stage == 3) {
				if (line == 8) {
					fader = 0;
					riser = 1;
					lanes = [];
					player.opacity = 1;
					markedCars = [];
					cars.remove(player);
					cars.deleteAll();
					bombPower = false;
				}
				if (line == 9) {
					lanesPerRoadway = 9;
					carsPerLane = 15;
					world.timeScale = 1;
					fader = 1;
					riser = 0;
					player.wasMarked = false;
					player.speed = 0;
					player.direction = 0;
					player.rotationSpeed = 0;
					player.rotation = 0;
					player.rotationLock = true;
					player.gravityScale = 0;
					createLanes();
				}
			}

			if (stage == 4) {
				if (line == 1) {
					fast_traffic.volume = 0.2;
					slow_traffic.volume = 0.2;
					traffic_jam.volume = 0.4;
					traffic_jam.play();
				}
				if (line == -1) {
					fader = 1;
					riser = 0;
					fast_traffic.pause();
					slow_traffic.pause();
					traffic_jam.volume = 0.24;
					pete_holmes_bit.play();
					pete_holmes_bit.onended = () => {
						emotes.removeAll();
						nextStage();
						traffic_jam.volume = 1;
					};
				}
			}

			if (stage == 5) {
				if (line == 9) {
					fader = 1;
					riser = 0;
					train_flyby.play();
				}
				if (line == -1) {
					fast_traffic.pause();
					slow_traffic.pause();
					player.changeAni('train');
					lanesPerRoadway = 3;
					carsPerLane = 25;
					fader = 1;
					riser = 0;
					lanes = [];
					player.opacity = 1;
					removeFromLane(player);
					cars.remove(player);
					cars.deleteAll();
					nextStage();
					createLanes();
				}
			}
		}

		if (showDialog) {
			textSize(Math.round(width / dia[stage][line].length));

			let txt = dia[stage][line];
			let x = 0;
			let y = textY;

			let mod = txt.length < 20 && frameCount % 60 < 10;
			fill(mod ? 1 : 0);
			let offset = Math.round(textSize() / 16);
			textImage(txt, x + offset, y + offset);
			fill(mod ? 0 : 1);
			textImage(txt, x, y);
		}
	}

	if (stage == 0) {
		if (line == 3) {
			if (frameCount % 12 > 1) {
				player.changeAni('formula');
			} else {
				player.changeAni('station');
			}
		}

		if (line == -1 && frameCount > 4000 && player.carAhead.vel.x < 3) {
			nextStage();
		}
	} else if (stage == 1) {
		if (line == -1 && grabbedCars > 10) {
			nextStage();
		}
	} else if (stage == 2) {
		if (line == -1 && bombedCars > 40) {
			nextStage();
			startStage3();
		}
	} else if (stage == 3) {
		if (line == -1 && player.carAhead.vel.x < 3) {
			nextStage();
		}
	}
}

function nextStage() {
	stage++;
	line = 0;
	fader = 1;
	riser = 0;
	showDialog = true;
}

function startStage3() {
	world.timeScale = 0.25;
	bombCar(player);
}

q.update = () => {
	if (contro.leftStick.y < 0.5 && contro.leftStick.y > -0.5) {
		stickLockout = false;
	}
	if (stage != 6) {
		if (kb.presses('up') || contro.presses('up') || (contro.ls.y < -0.75 && !stickLockout)) {
			if (player.lane > 0) {
				if (isLaneOpen(player, player.lane - 1)) {
					insertInLane(player, player.lane - 1);
					player.targetY = lanes[player.lane].y - player.hh - 1;
					if (player.vel.x < 0.5) player.vel.x = 0.5; // ensure player moves forward
					stickLockout = true;
				} else {
					player.y -= 4;
					crash.play();
				}
			}
		}
		if (kb.presses('down') || contro.presses('down') || (contro.ls.y > 0.75 && !stickLockout)) {
			if (player.lane < lanesPerRoadway - 1) {
				if (isLaneOpen(player, player.lane + 1)) {
					insertInLane(player, player.lane + 1);
					player.targetY = lanes[player.lane].y - player.hh - 1;
					if (player.vel.x < 0.5) player.vel.x = 0.5; // ensure player moves forward
					stickLockout = true;
				} else {
					player.y += 4;
					crash.play();
				}
			}
		}
	}

	// Animate player y position toward targetY, lerp speed mapped from player.vel.x
	let minLerp = 0.05;
	let maxLerp = 0.2;
	let minSpeed = 0;
	let maxSpeed = 5;
	let lerpSpeed = map(player.vel.x, minSpeed, maxSpeed, minLerp, maxLerp, true);
	player.y += (player.targetY - player.y) * lerpSpeed;

	if (stage != 4 && stage != 6) {
		if (kb.pressing('left') || contro.presses('left') || contro.lt) player.vel.x -= 0.1;
		if (kb.pressing('right') || contro.presses('right') || contro.rt) player.vel.x += 0.1;
		if (contro.ls.x < -0.2) player.vel.x += contro.ls.x * 0.08; // left
		if (contro.ls.x > 0.2) player.vel.x += contro.ls.x * 0.08; // right
	}
	if (player.vel.x < 0) player.vel.x = 0;

	updateCars();

	if (frameCount % 60 == 0) {
		cursorWaitIdx = (cursorWaitIdx + 1) % 3;
	}

	if (mouse.pressed()) mouseControlsEnabled = true;

	if (mouse.presses() || kb.presses(' ') || contro.presses('a')) {
		if (stage <= 4) {
			if (!fast_traffic.playing) fast_traffic.play();
			if (!slow_traffic.playing) slow_traffic.play();
		}
		if (stage >= 5) {
			if (!traffic_jam.playing) traffic_jam.play();
		}
		if (stage == 6) {
			if (!train_flyby.playing) train_flyby.play();
		}
	}

	if (grabPower && cur.overlapping(cars)) {
		cur.rotation = 0;
		if (mouse.pressing() || kb.pressing(' ') || contro.a || contro.l || contro.r || contro.select) {
			if (!grabCar) {
				grabCar = world.getSpriteAt(cur.x, cur.y, cars);
				if (grabCar) grabbedCars++;
			}
			if (grabCar) {
				cur.changeAni('grabbing');
				changeToClosestLane(grabCar);

				let offset = 0;
				if (grabCar.dir == 1) {
					// Calculate offset to avoid overlap with car in front
					let lane = lanes[grabCar.lane];
					let dir = lane.dir;
					let idx = grabCar.idxInLane;
					let carAhead = lane[idx - 1];
					if (carAhead) {
						let minGap = carAhead.hw + grabCar.hw + 2;
						if (dir === 1) {
							let desiredX = carAhead.x - minGap;
							if (mouse.x > desiredX) offset = desiredX - mouse.x;
						} else {
							let desiredX = carAhead.x + minGap;
							if (mouse.x < desiredX) offset = desiredX - mouse.x;
						}
					}
				}

				grabCar.moveTowards(cur.x + offset, cur.y, 0.1);
			}
		} else {
			cur.changeAni('grab');
		}
	} else if (bombPower && cur.overlapping(cars)) {
		cur.changeAni('crosshair');
		cur.rotation += 4;
		let car = world.getSpriteAt(cur.x || mouse.x, cur.y || mouse.y, cars);
		if (car && !car.wasMarked && car != player) {
			bombCar(car);
		}
	} else if (player.vel.x < 2.5) {
		cur.rotation--;
		cur.changeAni('wait' + cursorWaitIdx);
	} else if (showDialog) {
		cur.rotation = 0;
		if (!mouse.pressing()) {
			cur.changeAni('dialog0');
		} else {
			cur.changeAni('dialog1');
		}
	} else {
		cur.rotation = 0;
		cur.changeAni('default');
	}

	if (
		mouse.released() ||
		kb.released(' ') ||
		contro.released('a') ||
		contro.released('r') ||
		contro.released('select')
	) {
		// figure out which lane to move the car to
		if (grabCar) {
			grabCar.vel.y = 0; // stop vertical movement
			changeToClosestLane(grabCar);
			grabCar.y = lanes[grabCar.lane].y - grabCar.hh - 1;
			grabCar = null;
		}
	}

	for (let car of markedCars) {
		if ((car.dir == 1 && car.y > 100) || (car.dir == -1 && car.y > 300)) {
			car.gravityScale = 0;
			car.speed = 0;
			car.rotationSpeed = 0;
		}
	}
};

q.drawFrame = () => {
	cursor('none');

	let bg = stage <= 1 ? 'skyblue' : 'orange';
	if (stage == 5) bg = 'pink';
	if (stage == 6) bg = color(0, 0, 0.2);
	background(bg);

	camera.x = player.x + width / 4;

	let noiseSeedOffset = 1000 + camera.x / 2000;

	// Draw background hills 1
	fill(0.8, 0.5, 0);
	beginShape();
	vertex(-halfWidth - 40, 0);
	noiseScale = 0.003;
	for (let x = -halfWidth - 400; x < halfWidth + 400; x += 5) {
		let n = noise(x * noiseScale + noiseSeedOffset);
		let y = hillBaseY - n * hillSize;
		vertex(x, y);
	}
	vertex(halfWidth + 40, 0);
	endShape(CLOSE);

	// Draw background hills 2
	fill(0.8, 0.6, 0); // more opaque shadow
	beginShape();
	noiseSeedOffset += 2000;
	noiseScale = 0.002;
	vertex(-halfWidth - 40 + hill2OffsetX, hill2OffsetY);
	for (let x = -halfWidth - 400; x < halfWidth + 400; x += 5) {
		let n = noise(x * noiseScale + noiseSeedOffset);
		let y = hillBaseY - n * hillSize + hill2OffsetY;
		vertex(x + hill2OffsetX, y);
	}
	vertex(halfWidth + 40 + hill2OffsetX, hill2OffsetY);
	endShape(CLOSE);

	rect(-halfWidth, 0, width, halfHeight);

	let roadWayHeight = lanesPerRoadway * 20;

	// draw pavement
	fill(0.5);
	rect(-halfWidth, topLaneY - 30, width, roadWayHeight + 25);
	rect(-halfWidth, bottomLaneY - 30, width, roadWayHeight + 25);

	// Draw road lines
	fill(1);
	rect(-halfWidth, topLaneY - 20, width, 2);
	rect(-halfWidth, topLaneY + roadWayHeight - 17, width, 2);
	rect(-halfWidth, bottomLaneY - 20, width, 2);
	rect(-halfWidth, bottomLaneY + roadWayHeight - 17, width, 2);

	// Draw dotted lane lines
	let dashLength = 40;
	let gapLength = 40;
	let totalLength = dashLength + gapLength;
	for (let i = 0; i < lanes.length; i++) {
		if (i % lanesPerRoadway === lanesPerRoadway - 1) continue;
		let lane = lanes[i];
		let y = lane.y + 3;
		// Offset so dashes move with camera.x
		let offset = -halfWidth - dashLength - (camera.x % totalLength);
		for (let x = offset; x < halfWidth; x += totalLength) {
			rect(x, y, dashLength, 2);
		}
	}

	if (stage == 6) {
		// Draw train tracks
		fill(0.5);
		let trackY = 88;
		rect(-halfWidth, trackY, width, 2);
		rect(-halfWidth, trackY + 8, width, 2);
		trackY = 120;
		rect(-halfWidth, trackY, width, 2);
		rect(-halfWidth, trackY + 8, width, 2);
	}

	if (stage >= 1) {
		if (stage == 1) {
			fill(1, 1, 0, riser / 2);
		} else if (stage == 2) {
			fill(1, fader, fader, riser / 2);
		} else if (stage == 3) {
			if (line <= 12 && line != -1) {
				if (line <= 8) {
					fill(0, fader, 0, riser);
				} else {
					fill(0, fader);
				}
			} else {
				fill(0, 0);
			}
		} else if (stage == 4) {
			if (line != -1) {
				fill(fader / 2, fader / 2, 1, Math.min(0.5, riser));
			} else {
				fill(riser, riser, 1, fader / 2);
			}
		} else if (stage == 5) {
			if (line <= 9) {
				fill(1, 0.5 + fader / 2, 0.5 + fader / 2, riser / 2);
			} else {
				fill(1, riser);
			}
		} else if (stage == 6) {
			fill(1, Math.max(0, 1 - riser * 4));
		}
		// tint screen effect
		rect(-halfWidth, -halfHeight, width, height);

		if (fader > 0) fader -= 0.001;
		else fader = 0;
		if (riser < 1) riser += 0.001;
		else riser = 1;
	}

	opacity(1);
	dialog();

	allSprites.debug = cur.autoDraw = kb.pressing('f');

	for (let car of cars) {
		if (
			player.overlapping(car) &&
			player.lane < car.lane &&
			player.y + player.hh < car.y + car.hh &&
			(!kb.pressing('down') || car.lane != player.lane + 1)
		) {
			if (car.opacity > 0.5) car.opacity -= 0.05;
			else car.opacity = sin(frameCount * 2) * 0.1 + 0.25; // subtle flicker effect
		} else if (stage == 3 && line <= 12 && line != -1) {
			car.opacity = line <= 8 ? fader : riser;
		} else if (stage == 5 && line >= 9) {
			car.opacity = fader;
		} else {
			car.opacity = 1;
		}
	}

	player.opacity = 1;

	for (let mark of marks) {
		mark.x = mark.car.x;
		mark.y = mark.car.y;
		if (mark.life % 20 < 15) mark.visible = true;
		else mark.visible = false;
	}

	if (emotes.length > 300) emotes[0].remove();

	if (stage == 4 && (line >= 8 || line == -1)) {
		let car = random(cars);
		let emote = new emotes.Sprite(car.x, car.y - 20);
		let emotions = Object.keys(emotes.anis);
		emote.changeAni(random() < 0.2 ? 'faceHappy' : random(emotions));
		emote.car = car;
		emote.layer = car.layer + 1000;
	}

	for (let emote of emotes) {
		emote.x = emote.car.x + 10;
		emote.y = emote.car.y - 50;
	}

	camera.on();
	allSprites.draw();
	camera.off();

	if (mouseControlsEnabled) {
		cur.moveTowards(mouse.x, mouse.y, 0.5);
		if (contro.rs.x < -0.2 || contro.rs.x > 0.2 || contro.rs.y < -0.2 || contro.rs.y > 0.2) {
			mouseControlsEnabled = false;
		}
	} else {
		cur.moveTowards(camera.x + contro.rs.x * halfWidth, camera.y + contro.rs.y * halfHeight, 0.5);
	}

	pushMatrix();
	if (mouseControlsEnabled) translate(mouseX, mouseY);
	else translate(contro.rs.x * halfWidth, contro.rs.y * halfHeight);
	scale(4);
	rotate(cur.rotation);
	opacity(1);
	cur.ani.draw(0, 0);
	popMatrix();
};
