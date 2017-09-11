(function(){// VARS
var TAU = Math.PI * 2;

var g = {
    INTERVAL:1000/60, //denominator is target fps for requestAnimationFrame
    lastTime:(new Date()).getTime(),
	clock: 0,
	seaClock: 0,
	keys: [],
	camera: {
		loc: {
			x: 0,
			y: 0
		}
	},
	ui:{
		overlays:{
			"compass": false,
			"map": false
		},
		sprites: {
			compass: createImage("img/compass.png"),
			compassBack: createImage("img/compassBack.png"),
			compassNeedle: createImage("img/compassNeedle.png"),
			map: createImage("img/map.png")
		}
	},
	particles: {
		sea: [],
		air: []
	},
	items: [],
	keyItems: [],
	inventory: [],
	objects: [],
	wind: {
		speed: 1,
		direction: 0
	},
	compassAccuracy: TAU/16,
	weather: "clear",
	brightness: 1,
	brightnessTarget: 1,
	weatherTypes: {
		calm: {
			raining: false,
			plinksPerFrame: 0,
			dropsPerFrame: 0,
			brightness: 0.5,
			seaChurn: 0.7,
			windStrength: 0.8,
			windVariance: 0.001
		},
		clear: {
			raining: false,
			plinksPerFrame: 0,
			dropsPerFrame: 0,
			brightness: 0.5,
			seaChurn: 1,
			windStrength: 1,
			windVariance: 0.002
		},
		rain: {
			raining: true,
			plinksPerFrame: 2,
			dropsPerFrame: 4,
			seaChurn: 1,
			brightness: 0.4,
			windStrength: 1,
			windVariance: 0.002
		},
		storm: {
			raining: true,
			plinksPerFrame: 4,
			dropsPerFrame: 8,
			brightness: 0.3,
			seaChurn: 1.5,
			windStrength: 1.2,
			windVariance: 0.003
		}
	},
	mobBehaviours: {
		randomSwim: function(mob){
			mob.rot += (noise.simplex2(g.clock + mob.randomClockOffset, 0) * 2 / -1) * TAU * 0.005;
			mob.loc.x += Math.sin(mob.rot) * mob.speed;
			mob.loc.y += Math.cos(mob.rot) * mob.speed * -1;
		},
		swimTowards: function(mob, loc, speed){
			var a = getAngleTo(mob.loc, loc);
			var b = mod(mob.rot - a, TAU);
			if (b > TAU/2) mob.rot += TAU*0.005;
			if (b < TAU/2) mob.rot -= TAU*0.005;
			mob.loc.x += Math.sin(mob.rot) * speed;
			mob.loc.y += Math.cos(mob.rot) * speed * -1;
		}
	}
};

g.boat = {
	model: {
		hull: {
			img: createImage('img/sailboat.png'),
			height: 32,
			width: 32,
			scale: 2,
			baseHeight: 0,
			z: 5,
			offset: { x:0, y:0 },
			rot: 0
		},
		sail: {
			img: createImage('img/sailboat-sail.png'),
			height: 32,
			width: 32,
			scale: 2,
			baseHeight: -10,
			z: 12,
			offset: { x:0, y: 5 },
			rot: 0
		},
		mast: {
			img: createImage('img/sailboat-mast.png'),
			height: 32,
			width: 32,
			scale: 2,
			baseHeight: -10,
			z: 12,
			offset: { x:0, y: 5 },
			rot: 0
		}
	},
	sailsFurled: false,
	rot: 0,
	sailRot: 0,
	loc: {
		y: 0,
		x: 0
	},
	speed: 0,
	
	MAXSPEED: 2,
	MAXSPEEDREVERSE: -1,
	ACCELERATION: 0.02,
	DRAG: 0.01,
	HULLROTSPEED: 0.01,
	SAILROTSPEED: 0.01
};

// CONSTRUCTORS

function Particle(model){
	//model = loc: obj, life: int, draw: function
	this.loc = model.loc;
	this.time = 0;
	this.life = model.life;
	this.animate = model.animate;
	this.iterate = () => {
		this.time++;
		this.animate();
		if (this.time > this.life) this.destroy();
	};
	this.deleteMe = false;
	this.destroy = () => {
		this.deleteMe = true;
	};
	this.draw = model.draw
}

function Plink(x, y){
	var model = {
		loc: {
			x: x,
			y: y
		},
		life: 120,
		animate: () => {},
		draw: () => {
			g.ctx.strokeStyle = "#8888ff";
			g.ctx.beginPath();
			g.ctx.arc(this.loc.x - g.camera.loc.x, this.loc.y - g.camera.loc.y, this.time/10, 0, TAU);
			g.ctx.stroke();
		}
	};
	Particle.call(this, model);
}
function Raindrop(x){
	var model = {
		loc: {
			x: x,
			y: -10
		},
		life: 10,
		animate: () => {
			var windDir = Math.sin(g.wind.direction);
			
			this.loc.y += g.canvas.height/10;
			this.loc.x += 10 * windDir;
		},
		draw: () => {
			var windDir = Math.sin(g.wind.direction);
			g.ctx.strokeStyle = "#8888ff";
			g.ctx.beginPath();
			g.ctx.moveTo(this.loc.x, this.loc.y);
			g.ctx.lineTo(this.loc.x + 10 * windDir, this.loc.y + 40);
			g.ctx.stroke();
		}
	};
	Particle.call(this, model);
}
function Wake(x, y){
	var model = {
		loc: {
			x: x,
			y: y
		},
		life: 60,
		animate: () => {},
		draw: () => {
			g.ctx.fillStyle = "rgba(136, 136, 255, " + Math.min(2.5/this.life,1) + ")";
			g.ctx.beginPath();
			g.ctx.arc(this.loc.x - g.camera.loc.x, this.loc.y - g.camera.loc.y, 10 - this.time/6, 0, TAU);
			g.ctx.fill();
		}
	};
	Particle.call(this, model);
}

function Mob(model){
	this.loc = model.loc;
	this.rot = model.rot;
	this.speed = model.speed;
	this.model = model.model;
	this.ai = model.ai;
	this.randomClockOffset = model.randomClockOffset;
}
function Fish(x, y, rot){
	var m = {
		loc: {
			x: x,
			y: y
		},
		rot: rot,
		speed: 0.5,
		randomClockOffset: Math.floor(Math.random() * 200),
		ai: () => {
			g.mobBehaviours.randomSwim(this);
		},
		model: {
			body: {
				img: createImage('img/fish.png'),
				height: 16,
				width: 8,
				scale: 1,
				baseHeight: 0,
				z: 1,
				offset: { x:0, y:0 },
				rot: 0
			}
		}
	};
	Mob.call(this, m);
}
function Shark(x, y, rot){
	var m = {
		loc: {
			x: x,
			y: y
		},
		rot: rot,
		speed: 0.6,
		randomClockOffset: 0,
		ai : () => {
			var loc = {
				x: g.boat.loc.x,
				y: g.boat.loc.y
			}
			loc.x += Math.sin(g.clock/TAU) * 80;
			loc.y += Math.cos(g.clock/TAU) * 80;
			var speed = this.speed;
			if (calcDistance(g.boat.loc, this.loc) > g.canvas.width) speed = g.boat.MAXSPEED * 0.8;
			g.mobBehaviours.swimTowards(this, loc, speed);
		},
		model: {
			body: {
				img: createImage('img/fish.png'),
				height: 16,
				width: 8,
				scale: 2,
				baseHeight: 0,
				z: 1,
				offset: { x:0, y:0 },
				rot: 0
			}
		}
	}
	Mob.call(this, m);
}
	
function Item(itemType, x, y, model, sprites, onCollect){
	this.itemType = itemType;
	this.loc = {
		x: x,
		y: y
	};
	this.exists = true;
	this.isCollected = () => {
		if (calcDistance(this.loc, g.boat.loc) < 20) return true;
	};
	this.collect = () => {
		g.inventory.push(this.itemType);
		this.exists = false;
		for (var i=0, j=g.keyItems.length; i<j; i++){
			if (g.keyItems[i].itemType === this.itemType){
				if ((g.keyItems[i].loc.x === this.loc.x) &&
					(g.keyItems[i].loc.y === this.loc.y)){
					g.keyItems.splice(i,1);
					break;
				}
			}
		}
		this.onCollect();
	};
	this.onCollect = onCollect;
	this.model = model;
	this.sprites = sprites;
	this.draw = () => {
		drawObject(this, this.sprites);
	}
}
function Compass(x, y){
	var model = {
		compass: {
			img: createImage('img/compass.png'),
			height: 16,
			width: 16,
			scale: 1,
			baseHeight: 0,
			z: 1,
			offset: { x:0, y:0 },
			rot: 0
		}
	};
	Item.call(this, "compass", x, y, model, ["compass"], () => {
		document.getElementById("compass-control").style.display = "inline";
	})
}
function Map(x, y){
	var model = {
		map: {
			img: createImage('img/map.png'),
			height: 16,
			width: 16,
			scale: 1,
			baseHeight: 0,
			z: 1,
			offset: { x:0, y:0 },
			rot: 0
		}
	};
	Item.call(this, "map", x, y, model, ["map"], () => {
		document.getElementById("map-control").style.display = "inline";
	})
}
function Tablet(x, y, type){
	var model = {
		tablet: {
			img: createImage("img/tablet" + type + ".png"),
			height: 16,
			width: 16,
			scale: 1,
			baseHeight: 0,
			z: 1,
			offset: { x:0, y:0 },
			rot: 0
		}
	};
	Item.call(this, "tablet" + type, x, y, model, ["tablet"], () => {})
}

function Altar(x, y, itemType){
	this.itemType = itemType;
	this.loc = {
		x: x,
		y: y
	};
	this.tablet = false;
	this.model = {
		altar: {
			img: createImage("img/altar.png"),
			height: 32,
			width: 32,
			scale: 1,
			baseHeight: 0,
			z: 1,
			offset: { x:0, y:0 },
			rot: 0
		}
	};
	this.handleCollision = () => {
		if (!this.tablet){
			if (g.inventory.indexOf("tablet" + itemType) > -1){
				this.tablet = new Tablet(this.loc.x, this.loc.y - 8, this.itemType);
			}
		}
	};
	this.draw = () => {
		drawObject(this, ["altar"]);
		if (this.tablet) drawObject(this.tablet, ["tablet"]);
	}
}

// UTILITY

function mod(n, m) {
	return ((n % m) + m) % m;
}

function createImage(src){
	var i = document.createElement('img');
	i.src = src;
	return i;
}

function animateParticles(layer){
	var particles = [];
	for (var particle in g.particles[layer]){
		var p = g.particles[layer][particle];
		p.iterate();
		if (!p.deleteMe) particles.push(p);
	}
	g.particles[layer] = particles;
}

function calcDistance(location1, location2){
	return Math.sqrt(Math.pow(location1.x - location2.x, 2) + Math.pow(location1.y - location2.y, 2))
}

function getAngleTo(location1, location2){
	var yDiff = location1.y - location2.y;
	var xDiff = location1.x - location2.x;
	return Math.atan2(yDiff, xDiff) - TAU/4;
}

function getImageData(x, y, radius){
	return g.ctx.getImageData(x - radius, y - radius, radius*2, radius*2);
}

// GAME WORLD

function updateWeather(){
	if (Math.random() < (0.01 / 60)){
		var r = Math.random();
		if (r < 0.3) {
			g.weather = "calm";
		} else if (r < 0.6) {
			g.weather = "clear";
		} else if (r < 0.9) {
			g.weather = "rain";
		} else {
			g.weather = "storm";
		}
	}
	if (g.weatherTypes[g.weather].raining){
		for (var i = 0; i < g.weatherTypes[g.weather].plinksPerFrame; i++){
			g.particles.sea.push(new Plink((Math.random()*2-0.5) * g.canvas.width + g.camera.loc.x, (Math.random()*2-0.5) * g.canvas.height + g.camera.loc.y));
		}
		for (var j = 0; j < g.weatherTypes[g.weather].dropsPerFrame; j++){
			g.particles.air.push(new Raindrop((Math.random()*2-0.5) * g.canvas.width, (Math.random()*2-0.5) * g.canvas.height));
		}
	}
}

function updateWind(){
	g.wind.speed = g.weatherTypes[g.weather].windStrength * (noise.simplex2(g.clock/30, g.clock/30) + 1) / 2;
	g.wind.direction = 2 * TAU * (noise.simplex2(g.clock/5 * g.weatherTypes[g.weather].windVariance, 0));
}

function drawSwirl(x, y, radius){
	//based on http://geekofficedog.blogspot.co.uk/2013/04/hello-swirl-swirl-effect-tutorial-in.html
	var original = getImageData(x, y, radius);
	var sample = getImageData(g.canvas.width/2, g.canvas.height/2, radius);

	for (var yP = radius * -1; yP < radius; yP++){
		for (var xP = radius * -1; xP < radius; xP++){
			if (xP*xP + yP*yP < radius*radius){
				//we are inside the circle
				var position = ((yP + radius) * radius*2 + (xP + radius)) * 4;
				
				//to polar
				var r = Math.sqrt(xP*xP + yP*yP);
				var alpha = Math.atan2(yP, xP);
				alpha += TAU/50 * r;
				//back to cartesian
				var newX = Math.floor(r * Math.sin(alpha));
				var newY = Math.floor(r * Math.cos(alpha));
				var newPos = ((newY + radius) * radius*2 + (newX + radius)) * 4;

				original.data[newPos] = sample.data[position]; //r
				original.data[newPos + 1] = sample.data[position + 1]; //g
				original.data[newPos + 2] = sample.data[position + 2]; //b
				original.data[newPos + 3] = 255; //a
			}
		}
	}

	g.ctx.putImageData(original, x - radius, y - radius);
}

function handleItems(){
	var newItems = [];
	for (var item in g.items){
		if (g.items[item].exists){
			var i = g.items[item];
			if (i.isCollected()){
				i.collect();
			}
			newItems.push(i);
		}
	}
	g.items = newItems;
}
function drawItems(){
	for (var item in g.items){
		g.items[item].draw();
	}
}

function getKeyItemLocation(){
	if (g.keyItems.length > 0){
		return g.keyItems[0].loc;
	} else {
		return { x: 0, y: 0 };
	}
}

function handleAltars(){
	var allFilled = true;
	//collision
	for (var item in g.objects){
		var o = g.objects[item];
		if (calcDistance(o.loc, g.boat.loc) < 30){
			var x = Math.sin(getAngleTo(o.loc, g.boat.loc));
			var y = Math.cos(getAngleTo(o.loc, g.boat.loc));
			g.boat.loc.x += x;
			g.boat.loc.y -= y;
			if (Math.abs(g.boat.loc.x - g.camera.loc.x) > 50) {
				g.camera.loc.x += x;
			}
			if (Math.abs(g.boat.loc.y - g.camera.loc.y) > 50) {
				g.camera.loc.y -= y;
			}
			o.handleCollision();
		}
		if (allFilled) allFilled = !!o.tablet;
	}
	if (allFilled) g.whirlpool = true;
}
function drawObjects(){
	if (g.whirlpool){
		if (calcDistance(g.camera.loc, {x:0, y:0}) < g.canvas.width/2){
			drawSwirl(g.camera.loc.x * -1 + g.canvas.width/2, g.camera.loc.y * -1 + g.canvas.height/2, 70);
		}
	}
	for (var item in g.objects){
		g.objects[item].draw();
	}
}

// MOBS

function updateMobs(){
	var nextMobs = [];
	for (var mob in g.mobs){
		var m = g.mobs[mob];
		if (!m.ai) {
			console.log(m)
		} else {
			m.ai();
		}
		
		if ((m instanceof Fish) &&
			(((m.loc.x - g.camera.loc.x) < g.canvas.width * -1) || //deliberately four times the size of the canvas
			((m.loc.x - g.camera.loc.x) > g.canvas.width) ||
			((m.loc.y - g.camera.loc.y) < g.canvas.height * -1) ||
			((m.loc.y - g.camera.loc.y) > g.canvas.height))){
				var n = edgeFish();
				nextMobs.push(new Fish(n.x, n.y, n.rot));
		} else {
			nextMobs.push(m);
		}
	}
	g.mobs = nextMobs;
}
function edgeFish(){
	var r = Math.random();
	var m = {};
	if (r < 1/4){
		m.x = 0 - g.canvas.width/2 + g.camera.loc.x;
		m.y = g.canvas.height * Math.random() - g.canvas.height/2 + g.camera.loc.y;
		m.rot = TAU/4 + ((Math.random()*2-1) * TAU/8) ;
	} else if (r < 2/4) {
		m.x = g.canvas.width/2 + g.camera.loc.x;
		m.y = g.canvas.height * Math.random() - g.canvas.height/2 + g.camera.loc.y;
		m.rot = 3*TAU/4 + ((Math.random()*2-1) * TAU/8);
	} else if (r < 3/4) {
		m.y = 0 - g.canvas.height/2 + g.camera.loc.y;
		m.x = g.canvas.width * Math.random() - g.canvas.width/2 + g.camera.loc.x;
		m.rot = TAU/2 + ((Math.random()*2-1) * TAU/8);
	} else {
		m.y = g.canvas.height/2 + g.camera.loc.y;
		m.x = g.canvas.width * Math.random() - g.canvas.width/2 + g.camera.loc.x;
		m.rot = ((Math.random()*2-1) * TAU/8);
	}
	return m;
}

// GAME CONTROL

function rotateSail(amount){
	g.boat.sailRot += amount;
	g.boat.model.sail.rot += amount;
	g.boat.model.mast.rot += amount;
	if (g.boat.sailRot > TAU/4){
		g.boat.sailRot = TAU/4;
		g.boat.model.sail.rot = TAU/4;
		g.boat.model.mast.rot = TAU/4;
	} else if (g.boat.sailRot < TAU/-4){
		g.boat.sailRot = TAU/-4;
		g.boat.model.sail.rot = TAU/-4;
		g.boat.model.mast.rot = TAU/-4;
	}
}

function calculateThrust(){
	var windAngle = g.wind.direction;
	var boatAngle = g.boat.rot;
	var sailAngle = g.boat.rot + g.boat.sailRot;
	
	var incidence = Math.sin(mod(windAngle,TAU) - mod(sailAngle,TAU));
	var windToSail = incidence / Math.abs(incidence);
	var sailNormal = sailAngle + (TAU/4 * windToSail);
	
	var windMagnitude = g.wind.speed * Math.abs(incidence);
	
	var liftMagnitude = Math.max(Math.cos(mod(windAngle,TAU) - mod(sailAngle,TAU)) * -1, 0);
	
	var vectoredThrust = Math.cos(sailNormal - boatAngle) * (windMagnitude + liftMagnitude);
	
	g.thrustValues = { //for debugging
		windAngle: windAngle,
		boatAngle: boatAngle,
		sailAngle: sailAngle,
		
		incidence: incidence,
		windToSail: windToSail,
		sailNormal: sailNormal,
		
		windMagnitude: windMagnitude,
		liftMagnitude: liftMagnitude,
		vectoredThrust: vectoredThrust
	};
	if (g.boat.sailsFurled) return 0;
	return vectoredThrust || 0;
}

function calculateSpeed(thrust){
	g.boat.speed -= g.boat.DRAG * g.boat.speed/g.boat.MAXSPEED;
	g.boat.speed += (thrust * g.boat.ACCELERATION);
	
	if (g.boat.speed > g.boat.MAXSPEED) g.boat.speed = g.boat.MAXSPEED;
	if (g.boat.speed < g.boat.MAXSPEEDREVERSE) g.boat.speed = g.boat.MAXSPEEDREVERSE;
}

function moveBoat(){
	var scalar = g.boat.speed;
	g.boat.loc.y += Math.cos(g.boat.rot) * scalar * -1;
	g.boat.loc.x += Math.sin(g.boat.rot) * scalar;
	if (Math.abs(g.boat.loc.x - g.camera.loc.x) > 50) {
		g.camera.loc.x += Math.sin(g.boat.rot) * scalar;
	}
	if (Math.abs(g.boat.loc.y - g.camera.loc.y) > 50) {
		g.camera.loc.y += Math.cos(g.boat.rot) * scalar * -1;
	}
	if (g.whirlpool){
		var dist = calcDistance(g.boat.loc, {x:0,y:0});
		if (dist < 5){
			g.boat.speed = 0;
			typeof g.boat.whirlRot === "undefined" ? g.boat.whirlRot = 0 : g.boat.whirlRot += TAU/6000;
			g.boat.rot += g.boat.whirlRot;
			if (g.boat.whirlRot > TAU/10) g.victory = 0.01;
		} else if (dist < 70){
			var angle = getAngleTo(g.boat.loc, {x:0,y:0});
			g.boat.loc.y -= Math.min(Math.max(Math.cos(angle) * 35/dist, -1), 1);
			g.boat.loc.x += Math.min(Math.max(Math.sin(angle) * 35/dist, -1), 1);
			if (Math.abs(g.boat.loc.x - g.camera.loc.x) > 50) {
				g.camera.loc.x += Math.min(Math.max(Math.cos(angle) * 35/dist, -1), 1);
			}
			if (Math.abs(g.boat.loc.y - g.camera.loc.y) > 50) {
				g.camera.loc.y += Math.min(Math.max(Math.sin(angle) * 35/dist, -1), 1);
			}
		}
	}
}

// DRAWING

function clear(){
    g.ctx.fillStyle = "#5499C7";
    g.ctx.fillRect(0,0,g.canvas.width,g.canvas.height);
}

function drawParticles(layer){
	for (var particle in g.particles[layer]){
		g.particles[layer][particle].draw();
	}
}

function drawSea(){
	var image = g.ctx.createImageData(g.canvas.width, g.canvas.height);
	var data = image.data;

	for (var y = 0; y < g.canvas.height; y += 2) { // doing this by twos quarters the number of times we have to make the noise call, which is expensive
		for (var x = 0; x < g.canvas.width; x += 2) {
			var value = Math.abs(noise.simplex3((x + g.camera.loc.x)/400, (y + g.camera.loc.y)/400, g.seaClock/25));
			value *= 64;
			var cell = (x + y * g.canvas.width) * 4;
			data[cell] = data[cell + 4] = data[cell + g.canvas.width*4] = data[cell + 4 + g.canvas.width*4] = 128 - value;
			data[cell + 1] = data[cell + 5] = data[cell + 1 + g.canvas.width*4] = data[cell + 5 + g.canvas.width*4] = 150 - value;
			data[cell + 2] = data[cell + 6] = data[cell + 2 + g.canvas.width*4] = data[cell + 6 + g.canvas.width*4] = 255;
			data[cell + 3] = data[cell + 7] = data[cell + 3 + g.canvas.width*4] = data[cell + 7 + g.canvas.width*4] = 255;
		}
	}
	g.ctx.putImageData(image, 0, 0);
}

function drawSprite(model){
	//model: image, sx, sy, sWidth, sHeight, dy, dx, dHeight, dWidth
	g.ctx.save();
	var tx = model.dx - g.camera.loc.x + g.canvas.width/2;
	var ty = model.dy + model.baseHeight - g.camera.loc.y + g.canvas.height/2;
	g.ctx.translate(tx, ty);
	if (model.rot) g.ctx.rotate(model.rot);
	g.ctx.translate(model.spriteOffsetX, model.spriteOffsetY);
	if (model.spriteRot) g.ctx.rotate(model.spriteRot);
	if (typeof model.sx != "undefined" &&
		typeof model.sy != "undefined" &&
		typeof model.sWidth != "undefined" &&
		typeof model.sHeight != "undefined"){
		//place on source image
		g.ctx.drawImage(model.image, model.sx, model.sy, model.sWidth, model.sHeight, model.dWidth/-2, model.dHeight/-2, model.dWidth, model.dHeight )
	} else if (typeof model.dWidth != "undefined" && typeof model.dHeight != "undefined") {
		//scaled
		g.ctx.drawImage(model.image, model.dWidth/-2, model.dHeight/-2, model.dWidth, model.dHeight)
	} else {
		//unscaled
		g.ctx.drawImage(model.image, 0, 0)
	}
	g.ctx.restore();
}

function drawObject(obj, sprites){
	for (var i = 0; i < sprites.length; i++){
		var sprite = obj.model[sprites[i]];
		for (var j = 0; j < sprite.z; j++){
			var m = {
				image: sprite.img,
				sy: 0,
				sx: sprite.width * j,
				sHeight: sprite.height,
				sWidth: sprite.width,
				dy: obj.loc.y - (j * 2),
				dx: obj.loc.x,
				dHeight: sprite.height * sprite.scale,
				dWidth: sprite.width * sprite.scale,
				rot: obj.rot,
				spriteRot: sprite.rot,
				baseHeight: sprite.baseHeight,
				spriteOffsetY: sprite.offset.y,
				spriteOffsetX: sprite.offset.x
			};
			drawSprite(m);
		}
	}
}

function drawBoat(){
	if (g.boat.sailsFurled) {
		drawObject(g.boat, ["hull", "mast"]);
	} else {
		drawObject(g.boat, ["hull", "sail"]);
	}
	g.particles.sea.push(new Wake(g.boat.loc.x + g.canvas.width/2, g.boat.loc.y + g.canvas.height/2));
}

function drawUI(){
	g.ctx.font='normal 12px Arial';
	g.ctx.fillStyle = "lightgrey";
	g.ctx.fillText((g.wind.speed * 10).toFixed(0), 30, 60);
	drawWindArrow();
	drawCompass();
	drawMap();
}

function drawWindArrow(){
	g.ctx.font='bold 30px Arial';
	g.ctx.textAlign = 'center';
	g.ctx.textBaseline = "middle"; 
	g.ctx.save();
	g.ctx.translate(30, 30);
	g.ctx.rotate(g.wind.direction - TAU/4);
	g.ctx.fillText("\u2192", 0, 0);
	g.ctx.restore();
}

function drawCompass(){
	if (g.inventory.indexOf("compass") > -1){
		g.ctx.save();
		var destinationAngle = getAngleTo(g.boat.loc, getKeyItemLocation());
		var compassAngle = destinationAngle + g.compassAccuracy * 2 * (noise.simplex2(0, g.clock/20) - 0.5);
		if (g.ui.overlays.compass){
			g.ctx.translate(g.canvas.width/2, g.canvas.height/2);
			g.ctx.drawImage(g.ui.sprites.compassBack, -80, -80, 160, 160);
			g.ctx.rotate(compassAngle);
			g.ctx.drawImage(g.ui.sprites.compassNeedle, -80, -80, 160, 160);
		} else {
			g.ctx.translate(g.canvas.width - 20 - 16, 20 + 16);
			g.ctx.drawImage(g.ui.sprites.compassBack, -16, -16, 32, 32);
			g.ctx.rotate(compassAngle);
			g.ctx.drawImage(g.ui.sprites.compassNeedle, -16, -16, 32, 32);
		}
		g.ctx.restore();
	} else {
		g.ctx.globalAlpha = 0.2;
		g.ctx.drawImage(g.ui.sprites.compass, g.canvas.width - 20 - 32, 20, 32, 32);
		g.ctx.globalAlpha = 1;
	}
}
function drawMap(){
	if (g.inventory.indexOf("map") > -1){
		writeToMapImage();
		if (g.ui.overlays.map){
			g.ctx.fillStyle = "rgba(239,228,176,1)";
			g.ctx.shadowColor = "black";
			g.ctx.shadowBlur = 20;
			g.ctx.fillRect(64, 64, g.canvas.width - 128, g.canvas.height - 128);
			g.ctx.shadowBlur = 0;
			drawMapImage();
		} else {
			g.ctx.drawImage(g.ui.sprites.map, g.canvas.width - 20 - 32, 20 + 20 + 32, 32, 32);
		}
	} else {
		g.ctx.globalAlpha = 0.2;
		g.ctx.drawImage(g.ui.sprites.map, g.canvas.width - 20 - 32, 20 + 20 + 32, 32, 32);
		g.ctx.globalAlpha = 1;
	}
}
function writeToMapImage(){
	var mapExtentX = (g.canvas.width - 200);
	var mapExtentY = (g.canvas.height - 200);
	if (!g.mapData){
		g.mapData = g.ctx.createImageData(mapExtentX, mapExtentY);
		var d = g.mapData.data;
		for (var i=0; i < d.length; i += 4){
			d[i] = "239";
			d[i + 1] = "228";
			d[i + 2] = "176";
			d[i + 3] = "255";
		}
	}
	var data = g.mapData.data;
	for (var y = mapExtentY/-2; y < mapExtentY/2; y++) {
		for (var x = mapExtentX/-2; x < mapExtentX/2; x++) {
			var val = ((y + mapExtentY/2) * mapExtentX + (x + mapExtentX/2)) * 4;
			if (calcDistance(g.boat.loc, {x: x*100, y: y*100}) < 1000){
				data[val] = "239";
				data[val + 1] = "228";
				data[val + 2] = "176";
				data[val + 3] = "230";
			}
		}
	}
}
function drawMapImage(){
	var mapExtentX = (g.canvas.width - 200);
	var mapExtentY = (g.canvas.height - 200);
	g.ctx.putImageData(g.mapData, 100, 100);
	g.ctx.font = '12px "Comic Sans", cursive';
	g.ctx.fillStyle = "red";
	var Xx = Math.min(Math.max(100 + mapExtentX/2 + g.boat.loc.x/100, 100), g.canvas.width - 100);
	var Xy = Math.min(Math.max(100 + mapExtentY/2 + g.boat.loc.y/100, 100), g.canvas.height - 100);
	g.ctx.fillText("X", Xx, Xy);
}

function drawMobs(){
	for (var mob in g.mobs){
		if (g.mobs[mob].model){
			drawObject(g.mobs[mob], ["body"]);
		}
	}
}

function drawLightingOverlay(){
	var timeBrightness = Math.round(Math.cos(g.clock/(Math.PI*100))*1000)/1000;
	timeBrightness = Math.max(timeBrightness, 0.1);
	timeBrightness = Math.min(timeBrightness, 0.5);
	
	var weatherBrightness = g.weatherTypes[g.weather].brightness;
	
	g.brightnessTarget = timeBrightness + weatherBrightness;
	if (g.brightnessTarget != g.brightness){
		g.brightness += 0.01 * ((g.brightnessTarget - g.brightness)/Math.abs(g.brightnessTarget - g.brightness));
		g.brightness = Math.round(g.brightness * 1000)/1000;
	}
	g.ctx.fillStyle = "rgba(0, 0, 0, " + (1 - g.brightness) + ")";
	g.ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)
}

function toggleOverlay(overlay){
	if (g.ui.overlays[overlay]){
		g.ui.overlays[overlay] = false;
	} else {
		for (var o in g.ui.overlays){
			g.ui.overlays[o] = false;
		}
		g.ui.overlays[overlay] = true;
	}
}

function drawVictory(){
	if (g.victory < 1) g.victory += 0.001;
	g.ctx.fillStyle = "black";
	g.ctx.fillRect(0,0, g.canvas.width, g.canvas.height);
	g.ctx.fillStyle = "rgba(255,255,255," + g.victory + ")";
	g.ctx.font = 'normal 12px Arial';
	var poem = ["Adrift! A little boat adrift!",
		"And night is coming down!",
		"Will no one guide a little boat",
		"Unto the nearest town?",
		"",
		"So Sailors say-on yesterday-",
		"Just as the dusk was brown",
		"One little boat gave up its strife",
		"And gurgled down and down.",
		"",
		"So angels say-on yesterday-",
		"Just as the dawn was red",
		"One little boat-o'erspent with gales-",
		"Retrimmed its masts-redecked its sails-",
		"And shot-exultant on!",
		"",
		"-Emily Dickinson"];
	for (var i=0; i < poem.length; i++){
		g.ctx.fillText(poem[i], g.canvas.width/2, 40 + 20*i);
	}
}

// EVENT BINDING

document.body.onkeydown = function(evt){
	g.keys[evt.keyCode] = true;
	handleKeyPress(evt.keyCode);
};
document.body.onkeyup = function(evt){
	if (g.keys[evt.keyCode]) g.keys[evt.keyCode] = false;
};

function handleKeyDown(){
	if (g.keys[65]){
		rotateSail(TAU * g.boat.SAILROTSPEED)
	}
	if (g.keys[68]){
		rotateSail(TAU * g.boat.SAILROTSPEED * -1)
	}
	if (g.keys[37]){
		g.boat.rot -= TAU * g.boat.HULLROTSPEED * (g.boat.speed/g.boat.MAXSPEED);
	}
	if (g.keys[39]){
		g.boat.rot += TAU * g.boat.HULLROTSPEED * (g.boat.speed/g.boat.MAXSPEED);
	}
}
function handleKeyPress(keyCode){
	if (keyCode == 70){ //F
		g.boat.sailsFurled = !g.boat.sailsFurled;
	}
	if (keyCode == 67){ //C 
		if (g.inventory.indexOf("compass") > -1){
			toggleOverlay("compass");
		}
	}
	if (keyCode == 77){ //M
		if (g.inventory.indexOf("map") > -1){
			toggleOverlay("map");
		}
	}
}

// SETUP

function setup(){
	document.getElementById("canvasContainer").innerHTML = "";
    g.canvas = document.createElement('canvas');
    g.canvas.id = "canvas";
    g.canvas.width = 600;
    g.canvas.height = 400;
    document.getElementById("canvasContainer").appendChild(g.canvas);
    g.ctx = g.canvas.getContext("2d");
    g.ctx.strokeStyle = "white";

	setupItems();
	setupObjects();
	setupMobs();
    gameLoop();
}

function setupItems(){
	var compass = new Compass(80, -80);
	g.items.push(compass);
	g.keyItems.push(compass);

	var map = new Map(-80, -80);
	g.items.push(map);
	g.keyItems.push(map);

	var tabRad = 8000;

	var tabletAir = new Tablet(Math.cos(7 * TAU / -8) * tabRad, Math.sin(7 * TAU / 8) * tabRad, "Air");
	g.items.push(tabletAir);
	g.keyItems.push(tabletAir);

	var tabletEarth = new Tablet(Math.cos(5 * TAU / -8) * tabRad, Math.sin(5 * TAU / 8) * tabRad, "Earth");
	g.items.push(tabletEarth);
	g.keyItems.push(tabletEarth);

	var tabletFire = new Tablet(Math.cos(3 * TAU / -8) * tabRad, Math.sin(3 * TAU / 8) * tabRad, "Fire");
	g.items.push(tabletFire);
	g.keyItems.push(tabletFire);

	var tabletWater = new Tablet(Math.cos(TAU / -8) * tabRad, Math.sin(TAU / 8) * tabRad, "Water");
	g.items.push(tabletWater);
	g.keyItems.push(tabletWater);
}

function setupObjects(){
	var altRad = 400;
	g.objects.push(new Altar(Math.cos(7 * TAU / -8) * altRad, Math.sin(7 * TAU / 8) * altRad, "Air"));
	g.objects.push(new Altar(Math.cos(5 * TAU / -8) * altRad, Math.sin(5 * TAU / 8) * altRad, "Earth"));
	g.objects.push(new Altar(Math.cos(3 * TAU / -8) * altRad, Math.sin(3 * TAU / 8) * altRad, "Fire"));
	g.objects.push(new Altar(Math.cos(TAU / -8) * altRad, Math.sin(TAU / 8) * altRad, "Water"));
}

function setupMobs(){
	g.mobs = [];
	for (var i=0; i<10; i++){
		g.mobs.push(new Fish(g.canvas.width * Math.random() - g.canvas.width/2, g.canvas.height * Math.random() - g.canvas.height/2, Math.random() * TAU))
	}
	g.mobs.push(new Shark(100, 100, Math.random() * TAU));
}

// MAIN LOOP

function gameLoop() {
    window.requestAnimationFrame(gameLoop);
    var currentTime = (new Date()).getTime();
    var delta = currentTime - g.lastTime;
    if (delta > g.INTERVAL) {

        //do loop here
		if (g.victory){
			drawVictory();
		} else {
			var d = (delta/1000);
			g.clock += d;
			g.seaClock += d * g.weatherTypes[g.weather].seaChurn;
			
			handleKeyDown();

			updateWeather();
			updateWind();
			animateParticles("sea");
			animateParticles("air");
			updateMobs();
			handleItems();
			handleAltars();
			
			calculateSpeed(calculateThrust());
			moveBoat(g.boat.speed);

			drawSea();
			drawMobs();
			drawParticles("sea");
			drawObjects();
			drawItems();
			drawBoat();
			drawParticles("air");
			drawLightingOverlay();
			drawUI();
		}
		
        g.lastTime = currentTime - (delta % g.INTERVAL);
    }
}

setup();

// 2017 @dhmstark
})()