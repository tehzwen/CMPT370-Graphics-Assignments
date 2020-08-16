main();

var xVector = vec3.fromValues(0.5, 0.0, 0.0);

/************************************
 * MAIN
 ************************************/

function main() {

    console.log("Setting up the canvas");

    // Find the canavas tag in the HTML document
    const canvas = document.querySelector("#assignmentCanvas");

    // Initialize the WebGL2 context
    var gl = canvas.getContext("webgl2");

    // Only continue if WebGL2 is available and working
    if (gl === null) {
        printError('WebGL 2 not supported by your browser',
            'Check to see you are using a <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API#WebGL_2_2" class="alert-link">modern browser</a>.');
        return;
    }

    // Hook up the button
    const fileUploadButton = document.querySelector("#fileUploadButton");
    fileUploadButton.addEventListener("click", () => {
        console.log("Submitting file...");
        let fileInput = document.getElementById('inputFile');
        let files = fileInput.files;
        let url = URL.createObjectURL(files[0]);

        fetch(url, {
            mode: 'no-cors' // 'cors' by default
        }).then(res => {
            return res.text();
        }).then(data => {
            var inputTriangles = JSON.parse(data);

            doDrawing(gl, canvas, inputTriangles);

        }).catch((e) => {
            console.error(e);
        });

    });
}

function doDrawing(gl, canvas, inputTriangles) {
    // Create a state for our scene

    var state = {
        camera: {
            position: vec3.fromValues(0.5, 0.5, -0.5),
            center: vec3.fromValues(0.5, 0.5, 0.0),
            up: vec3.fromValues(0.0, 1.0, 0.0),
        },
        objects: [],
        canvas: canvas,
        selectedObject: "arm"
    };
    changeSelectionText(state.selectedObject);



    for (var i = 0; i < inputTriangles.length; i++) {
        state.objects.push({
            name: inputTriangles[i].name,
            model: {
                position: vec3.fromValues(0.0, 0.0, 0.5),
                rotation: mat4.create(), // Identity matrix
                scale: vec3.fromValues(1.0, 1.0, 1.0),
            },
            programInfo: lightingShader(gl),
            buffers: undefined,
            // TODO: Add more object specific state
            materialList: inputTriangles[i].material,
            verticesList: inputTriangles[i].vertices,
            centroid: calculateCentroid(inputTriangles[i].vertices, vec3.fromValues(0.0, 0.0, 0.5)),
            children: inputTriangles[i].children
        });

        initBuffers(gl, state.objects[i], inputTriangles[i].vertices.flat(), inputTriangles[i].triangles.flat());
    }

    setupKeypresses(state);

    //console.log(state)

    console.log("Starting rendering loop");
    startRendering(gl, state);
}


/************************************
 * RENDERING CALLS
 ************************************/

function startRendering(gl, state) {
    // A variable for keeping track of time between frames
    var then = 0.0;

    // This function is called when we want to render a frame to the canvas
    function render(now) {
        now *= 0.001; // convert to seconds
        const deltaTime = now - then;
        then = now;

        // Draw our scene
        drawScene(gl, deltaTime, state);

        // Request another frame when this one is done
        requestAnimationFrame(render);
    }

    // Draw the scene
    requestAnimationFrame(render);
}

/**
 * Draws the scene. Should be called every frame
 * 
 * @param  {} gl WebGL2 context
 * @param {number} deltaTime Time between each rendering call
 */
function drawScene(gl, deltaTime, state) {
    // Set clear colour
    // This is a Red-Green-Blue-Alpha colour
    // See https://en.wikipedia.org/wiki/RGB_color_model
    // Here we use floating point values. In other places you may see byte representation (0-255).
    gl.clearColor(0.55686, 0.54902, 0.52157, 1.0);

    // Depth testing allows WebGL to figure out what order to draw our objects such that the look natural.
    // We want to draw far objects first, and then draw nearer objects on top of those to obscure them.
    // To determine the order to draw, WebGL can test the Z value of the objects.
    // The z-axis goes out of the screen
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things
    gl.clearDepth(1.0); // Clear everything

    // Clear the color and depth buffer with specified clear colour.
    // This will replace everything that was in the previous frame with the clear colour.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    state.objects.forEach((object) => {
        // Choose to use our shader
        gl.useProgram(object.programInfo.program);

        // Update uniforms
        {
            var projectionMatrix = mat4.create();
            var fovy = 60.0 * Math.PI / 180.0; // Vertical field of view in radians
            var aspect = state.canvas.clientWidth / state.canvas.clientHeight; // Aspect ratio of the canvas
            var near = 0.1; // Near clipping plane
            var far = 100.0; // Far clipping plane
            // Generate the projection matrix using perspective
            mat4.perspective(projectionMatrix, fovy, aspect, near, far);

            gl.uniformMatrix4fv(object.programInfo.uniformLocations.projection, false, projectionMatrix);

            var viewMatrix = mat4.create();
            mat4.lookAt(
                viewMatrix,
                state.camera.position,
                state.camera.center,
                state.camera.up,
            );
            gl.uniformMatrix4fv(object.programInfo.uniformLocations.view, false, viewMatrix);


            // Update model transform
            var modelMatrix = mat4.create();

            mat4.mul(modelMatrix, modelMatrix, object.model.rotation);

            mat4.translate(modelMatrix, modelMatrix, object.model.position);

            mat4.scale(modelMatrix, modelMatrix, object.model.scale);

            gl.uniformMatrix4fv(object.programInfo.uniformLocations.model, false, modelMatrix);

            // Update camera position
            gl.uniform3fv(object.programInfo.uniformLocations.cameraPosition, state.camera.position);

            // Update colors
            gl.uniform3fv(object.programInfo.uniformLocations.diffuseValue, object.materialList.diffuse);

        }
        // Draw 
        {
            // Bind the buffer we want to draw
            gl.bindVertexArray(object.buffers.vao);

            // Draw the object
            const offset = 0; // Number of elements to skip before starting
            gl.drawElements(gl.TRIANGLES, object.buffers.numVertices, gl.UNSIGNED_SHORT, offset);
        }
    });
}


/************************************
 * UI EVENTS
 ************************************/

function setupKeypresses(state) {
    document.addEventListener("keydown", (event) => {
        let negativeCentroid = vec3.create();
        let childrenObjects = getObjectByName(state, state.objects[0].children);

        switch (event.code) {
            case "KeyA":
                if (event.getModifierState("Shift")) {
                    // TODO: Rotate camera about Y axis
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.1, 0.0, 0.0));

                } else {
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.1, 0.0, 0.0));
                    vec3.add(state.camera.position, state.camera.position, vec3.fromValues(0.1, 0.0, 0.0));
                }
                break;
            case "KeyD":
                if (event.getModifierState("Shift")) {
                    // TODO: Rotate camera about Y axis
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(-0.1, 0.0, 0.0));

                } else {
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(-0.1, 0.0, 0.0));
                    vec3.add(state.camera.position, state.camera.position, vec3.fromValues(-0.1, 0.0, 0.0));
                }
                break;
            case "KeyW":
                if (event.getModifierState("Shift")) {
                    // TODO: Rotate camera about X axis
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, 0.1, 0.0));
                } else {
                    // TODO: Move camera along Z axis
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, 0.0, -0.1));
                    vec3.add(state.camera.position, state.camera.position, vec3.fromValues(0.0, 0.0, -0.1));
                }
                break;
            case "KeyS":
                if (event.getModifierState("Shift")) {
                    // TODO: Rotate camera about X axis
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, -0.1, 0.0));
                } else {
                    vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, 0.0, 0.1));
                    vec3.add(state.camera.position, state.camera.position, vec3.fromValues(0.0, 0.0, 0.1));
                }
                break;
            case "KeyQ":
                vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, -0.1, 0.0));
                vec3.add(state.camera.position, state.camera.position, vec3.fromValues(0.0, -0.1, 0.0));
                break;
            case "KeyE":
                vec3.add(state.camera.center, state.camera.center, vec3.fromValues(0.0, 0.1, 0.0));
                vec3.add(state.camera.position, state.camera.position, vec3.fromValues(0.0, 0.1, 0.0));
                break;
            case "ArrowLeft":
                // Decreases object selected index value
                if (state.selectedObject === "arm") {
                    state.selectedObject = "fingers";
                    changeSelectionText("fingers");
                } else {
                    state.selectedObject = "arm";
                    changeSelectionText("arm");
                }

                break;
            case "ArrowRight":
                // Increases object selected index value
                if (state.selectedObject === "arm") {
                    state.selectedObject = "fingers";
                    changeSelectionText("fingers");
                } else {
                    state.selectedObject = "arm";
                    changeSelectionText("arm");
                }
                break;

            case "KeyX":
                //rotate claws outwards
                if (state.selectedObject === "fingers") {
                    for (let i = 0; i < childrenObjects.length; i++) {
                        if (childrenObjects[i].name === "finger0") {
                            rotateObjectZInPlace(childrenObjects[i], -0.1);
                        } else {
                            rotateObjectZInPlace(childrenObjects[i], 0.1);
                        }
                    }
                } else {
                    rotateArmZ(state, 0.3);
                }

                break;
            case "KeyZ":
                //rotate claws inwards
                if (state.selectedObject === "fingers") {
                    for (let i = 0; i < childrenObjects.length; i++) {
                        if (childrenObjects[i].name === "finger0") {
                            rotateObjectZInPlace(childrenObjects[i], 0.1);
                        } else {
                            rotateObjectZInPlace(childrenObjects[i], -0.1);
                        }
                    }
                } else {
                    rotateArmZ(state, -0.3);
                }
                break;
            default:
                break;
        }
    });
}

/************************************
 * SHADER SETUP
 ************************************/
function lightingShader(gl) {
    // Vertex shader source code
    const vsSource =
        `#version 300 es
    in vec3 aPosition;

    uniform mat4 uProjectionMatrix;
    uniform mat4 uViewMatrix;
    uniform mat4 uModelMatrix;

    uniform vec3 uCameraPosition;

    out vec3 oFragPosition;
    out vec3 oCameraPosition;

    void main() {
        // Position needs to be a vec4 with w as 1.0
        gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
        
        // Postion of the fragment in world space
        oFragPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
        oCameraPosition = uCameraPosition;
    }
    `;

    // Fragment shader source code
    const fsSource =
        `#version 300 es
    precision highp float;

    out vec4 fragColor;
    
    in vec3 oFragPosition;
    in vec3 oCameraPosition;

    uniform vec3 diffuseVal;

    void main() {
        fragColor = vec4(diffuseVal, 1.0);
    }
    `;

    // Create our shader program with our custom function
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    const programInfo = {
        // The actual shader program
        program: shaderProgram,
        // The attribute locations. WebGL will use there to hook up the buffers to the shader program.
        // NOTE: it may be wise to check if these calls fail by seeing that the returned location is not -1.
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'aPosition'),
        },
        uniformLocations: {
            projection: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
            view: gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
            model: gl.getUniformLocation(shaderProgram, 'uModelMatrix'),
            cameraPosition: gl.getUniformLocation(shaderProgram, 'uCameraPosition'),
            // TODO: Add additional uniforms here
            diffuseValue: gl.getUniformLocation(shaderProgram, "diffuseVal"),
        },
    };

    // Check to see if we found the locations of our uniforms and attributes
    // Typos are a common source of failure
    if (programInfo.attribLocations.vertexPosition === -1 ||
        programInfo.uniformLocations.projection === -1 ||
        programInfo.uniformLocations.view === -1 ||
        programInfo.uniformLocations.model === -1 ||
        programInfo.uniformLocations.cameraPosition === -1 ||
        programInfo.uniformLocations.diffuseValue === -1) {
        printError('Shader Location Error', 'One or more of the uniform and attribute variables in the shaders could not be located');
    }

    return programInfo;
}

/************************************
 * BUFFER SETUP
 ************************************/

function initBuffers(gl, object, positionArray, indicesArray) {

    // We have 3 vertices with x, y, and z values
    const positions = new Float32Array(positionArray);

    // We are using gl.UNSIGNED_SHORT to enumerate the indices
    const indices = new Uint16Array(indicesArray);


    // Allocate and assign a Vertex Array Object to our handle
    var vertexArrayObject = gl.createVertexArray();

    // Bind our Vertex Array Object as the current used object
    gl.bindVertexArray(vertexArrayObject);

    object.buffers = {
        vao: vertexArrayObject,
        attributes: {
            position: initPositionAttribute(gl, object.programInfo, positions),
        },
        indices: initIndexBuffer(gl, indices),
        numVertices: indices.length,
    };
}

function initPositionAttribute(gl, programInfo, positionArray) {

    // Create a buffer for the positions.
    const positionBuffer = gl.createBuffer();

    // Select the buffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(
        gl.ARRAY_BUFFER, // The kind of buffer this is
        positionArray, // The data in an Array object
        gl.STATIC_DRAW // We are not going to change this data, so it is static
    );

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute.
    {
        const numComponents = 3; // pull out 3 values per iteration, ie vec3
        const type = gl.FLOAT; // the data in the buffer is 32bit floats
        const normalize = false; // don't normalize between 0 and 1
        const stride = 0; // how many bytes to get from one set of values to the next
        // Set stride to 0 to use type and numComponents above
        const offset = 0; // how many bytes inside the buffer to start from


        // Set the information WebGL needs to read the buffer properly
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        // Tell WebGL to use this attribute
        gl.enableVertexAttribArray(
            programInfo.attribLocations.vertexPosition);
    }

    return positionBuffer;
}

function initIndexBuffer(gl, elementArray) {

    // Create a buffer for the positions.
    const indexBuffer = gl.createBuffer();

    // Select the buffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER, // The kind of buffer this is
        elementArray, // The data in an Array object
        gl.STATIC_DRAW // We are not going to change this data, so it is static
    );

    return indexBuffer;
}

function rotateObjectZInPlace(object, val) {
    let negativeCentroid = vec3.create();
    vec3.negate(negativeCentroid, object.centroid);
    vec3.add(object.model.position, object.model.position, negativeCentroid);
    mat4.rotateZ(object.model.rotation, object.model.rotation, val);
    vec3.rotateZ(object.centroid, object.centroid, vec3.fromValues(0.0, 0.0, 0.0), -val);
    vec3.add(object.model.position, object.model.position, object.centroid);
}

function rotateArmZ(state, val) {
    let arm = state.objects[0];
    let childrenObjects = getObjectByName(state, arm.children);
    let negativeCentroid = vec3.create();
    vec3.negate(negativeCentroid, arm.centroid);
    vec3.add(arm.model.position, arm.model.position, negativeCentroid);

    //rotateObjectX(arm, val);
    mat4.rotateZ(arm.model.rotation, arm.model.rotation, val);
    vec3.rotateZ(arm.centroid, arm.centroid, vec3.fromValues(0.0, 0.0, 0.0), -val);


    for (let i = 0; i < childrenObjects.length; i++) {
        vec3.add(childrenObjects[i].model.position, childrenObjects[i].model.position, negativeCentroid);
        mat4.rotateZ(childrenObjects[i].model.rotation, childrenObjects[i].model.rotation, val);
        vec3.rotateZ(childrenObjects[i].centroid, childrenObjects[i].centroid, vec3.fromValues(0.0, 0.0, 0.0), -val);
        vec3.add(childrenObjects[i].model.position, childrenObjects[i].model.position, arm.centroid);
    }

    vec3.add(arm.model.position, arm.model.position, arm.centroid);
}

/**
 * 
 * @param {array of x,y,z vertices} vertices 
 */
function calculateCentroid(vertices, originalPosition) {
    let cX = 0,
        cY = 0,
        cZ = 0;

    for (let i = 0; i < vertices.length; i++) {
        //Cx
        cX += vertices[i][0];
        cY += vertices[i][1];
        cZ += vertices[i][2];
    }

    cX = cX / (vertices.length);
    cY = cY / (vertices.length);
    cZ = cZ / (vertices.length);

    //take into account the original position
    return vec3.fromValues(cX + originalPosition[0], cY + originalPosition[1], cZ + originalPosition[2]);
}
/**
 * 
 * @param {state object} state 
 * @param {array of object names we wish to fetch} objectNameArray 
 */

/**
 * 
 * @param {state object} state 
 * @param {array of object names we wish to fetch} objectNameArray 
 */
function getObjectByName(state, objectNameArray) {
    let tempArr = [];
    for (let i = 0; i < state.objects.length; i++) {
        if (objectNameArray.includes(state.objects[i].name)) {
            tempArr.push(state.objects[i]);
        }
    }
    return tempArr;
}