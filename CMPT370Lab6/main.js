main();

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

    var state = null;

    fetch('/statefiles/arm2.json')
        .then((data) => {
            return data.json()
        })
        .then((jData) => {
            var inputTriangles = jData;

            state = setupDrawing(gl, canvas, inputTriangles);

            //initial transforms of fingers 
            finger0 = getObjectByName(state, "finger0");
            finger1 = getObjectByName(state, "finger1");
            finger0.model.position = vec3.fromValues(-0.4, -0.2, 0.0);
            finger1.model.position = vec3.fromValues(-0.4, 0.2, 0.0);
            mat4.rotateZ(finger0.model.rotation, finger0.model.rotation, 0.35);
            mat4.rotateZ(finger1.model.rotation, finger1.model.rotation, -0.35);

            // translate arm with 0.5
            arm = getObjectByName(state, "arm");
            arm.model.position = vec3.fromValues(0.0, 0.0, 0.5);

            console.log("Starting rendering loop");
            startRendering(gl, state);
        })
        .catch((err) => {
            console.error(err);
        })
}

function getTextures(gl, object) {
    if (object.material.textureID) {
        var texture = gl.createTexture();

        const image = new Image();

        image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                gl.UNSIGNED_BYTE,
                image
            );
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE0);
        }

        image.src = '/statefiles/' + object.material.textureID;
        return texture;
    }
}

function setupDrawing(gl, canvas, inputTriangles) {
    // Create a state for our scene
    var state = {
        camera: {
            position: vec3.fromValues(0.0, 0.0, 3.0),
            center: vec3.fromValues(0.0, 0.0, 0.0),
            up: vec3.fromValues(0.0, 1.0, 0.0),
        },
        lights: [
            {
                position: vec3.fromValues(0.4, 0.0, 2.0),
                colour: vec3.fromValues(1.0, 1.0, 1.0),
                strength: 1.5,
            }
        ],
        objects: [],
        canvas: canvas,
        selectedIndex: 0,
        cameraBehaviour: {
            // These dictate how the camera rotates about the origin
            radius: 3.0,
            theta: Math.PI / 2.0,
        },
        samplerExists: false
    };

    for (var i = 0; i < inputTriangles.length; i++) {
        var tri = inputTriangles[i];
        state.objects.push(
            {
                model: {
                    position: (tri.model != null) ? vec3.fromValues(tri.model.position[0], tri.model.position[1], tri.model.position[2]) : vec3.fromValues(0.0, 0.0, 0.0),
                    rotation: mat4.create(), // Identity matrix
                    scale: (tri.model != null) ? vec3.fromValues(tri.model.scale[0], tri.model.scale[1], tri.model.scale[2]) : vec3.fromValues(1.0, 1.0, 1.0),
                },
                programInfo: textureShader(gl),
                buffers: null,
                materialList: tri.material,
                texture: getTextures(gl, tri),
                modelMatrix: mat4.create(),
                name: tri.name,
                centroid: calculateCentroid(tri.vertices),
                parent: tri.parent
                // TODO: Add more object specific state
            }
        );
        initBuffers(gl, state.objects[i], tri.vertices.flat(), tri.normals.flat(), tri.uvs.flat(), tri.triangles.flat());
    }

    return state;
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

        let arm = getObjectByName(state, "arm");
        mat4.rotateX(arm.model.rotation, arm.model.rotation, 0.8 * deltaTime);
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
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    // Depth testing allows WebGL to figure out what order to draw our objects such that the look natural.
    // We want to draw far objects first, and then draw nearer objects on top of those to obscure them.
    // To determine the order to draw, WebGL can test the Z value of the objects.
    // The z-axis goes out of the screen

    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE_MINUS_CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Clear the color and depth buffer with specified clear colour.
    // This will replace everything that was in the previous frame with the clear colour.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // TODO sort objects 
    var sortedObjects = state.objects.sort((a, b) => {
        return vec3.distance(state.camera.position, a.model.position) >= vec3.distance(state.camera.position, b.model.position) ? 1 : -1;
    });

    sortedObjects.forEach((object) => {
        // Choose to use our shader
        gl.useProgram(object.programInfo.program);

        // Update uniforms
        {
            if (object.materialList.alpha < 1.0) {

                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE_MINUS_CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.clearDepth(object.materialList.alpha);
            }
            else {
                gl.disable(gl.BLEND);
                gl.depthMask(true);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL); // Near things obscure far things
                gl.clearDepth(1.0);
            }

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


            var modelMatrix = mat4.create();
            var negCentroid = vec3.fromValues(0.0, 0.0, 0.0);
            vec3.negate(negCentroid, object.centroid);

            mat4.translate(modelMatrix, modelMatrix, object.model.position);
            mat4.translate(modelMatrix, modelMatrix, object.centroid);
            mat4.mul(modelMatrix, modelMatrix, object.model.rotation);
            mat4.translate(modelMatrix, modelMatrix, negCentroid);

            //update modelview with parent model view
            if (object.parent) {
                let parentObject = getObjectByName(state, object.parent);
                mat4.mul(modelMatrix, parentObject.modelMatrix, modelMatrix);
            }
            object.modelMatrix = modelMatrix;

            var normalMatrix = mat4.create();
            mat4.invert(normalMatrix, modelMatrix);
            mat4.transpose(normalMatrix, normalMatrix);

            gl.uniformMatrix4fv(object.programInfo.uniformLocations.model, false, modelMatrix);
            gl.uniformMatrix4fv(object.programInfo.uniformLocations.normalMatrix, false, normalMatrix);

            // Update camera position
            gl.uniform3fv(object.programInfo.uniformLocations.cameraPosition, state.camera.position);

            //Update lights
            gl.uniform3fv(object.programInfo.uniformLocations.light0Position, state.lights[0].position);
            gl.uniform3fv(object.programInfo.uniformLocations.light0Colour, state.lights[0].colour);
            gl.uniform1f(object.programInfo.uniformLocations.light0Strength, state.lights[0].strength);

            // TODO: Add uniform updates here

            gl.uniform3fv(object.programInfo.uniformLocations.ambientValue, object.materialList.ambient);
            gl.uniform3fv(object.programInfo.uniformLocations.diffuseValue, object.materialList.diffuse);
            gl.uniform3fv(object.programInfo.uniformLocations.specularValue, object.materialList.specular);
            gl.uniform1f(object.programInfo.uniformLocations.nValue, object.materialList.n);
            gl.uniform1f(object.programInfo.uniformLocations.alphaValue, object.materialList.alpha);
        }

        // Draw 
        {
            // Bind the buffer we want to draw
            gl.bindVertexArray(object.buffers.vao);

            if (object.texture != null) {
                state.samplerExists = 0;
                gl.uniform1i(object.programInfo.uniformLocations.samplerExists, state.samplerExists);
                gl.uniform1i(object.programInfo.uniformLocations.sampler, object.texture);
                gl.bindTexture(gl.TEXTURE_2D, object.texture);
                gl.activeTexture(gl.TEXTURE0);
            } else {
                state.samplerExists = 1;
                gl.uniform1i(object.programInfo.uniformLocations.samplerExists, state.samplerExists);
                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.activeTexture(gl.TEXTURE0);
            }

            // Draw the object
            const offset = 0; // Number of elements to skip before starting
            gl.drawElements(gl.TRIANGLES, object.buffers.numVertices, gl.UNSIGNED_SHORT, offset);
        }

    });
}

/************************************
 * SHADER SETUP
 ************************************/

function textureShader(gl) {

    // Vertex shader source code
    const vsSource =
        `#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    in vec2 aUV;

    uniform mat4 uProjectionMatrix;
    uniform mat4 uViewMatrix;
    uniform mat4 uModelMatrix;
    uniform mat4 normalMat;
    uniform vec3 uCameraPosition;
    
    out vec3 normalInterp;
    out vec3 oNormal;
    out vec3 oFragPosition;
    out vec3 oCameraPosition;
    out vec2 oUV;

    void main() {
        // Position needs to be a vec4 with w as 1.0
        gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
        
        // Postion of the fragment in world space
        oFragPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;

        oNormal = normalize((uModelMatrix * vec4(aNormal, 1.0)).xyz);
        oCameraPosition = uCameraPosition;
        oUV = aUV;
        normalInterp = vec3(normalMat * vec4(aNormal, 0.0));
    }
    `;

    // Fragment shader source code
    const fsSource =
        `#version 300 es
    precision highp float;

    out vec4 fragColor;

    in vec3 oNormal;
    in vec3 oFragPosition;
    in vec3 oCameraPosition;
    in vec3 normalInterp;
    in vec2 oUV;
    
    uniform vec3 ambientVal;
    uniform vec3 diffuseVal;
    uniform vec3 specularVal;
    uniform float nVal;
    uniform float alphaVal;
    uniform vec3 uLight0Position;
    uniform vec3 uLight0Colour;
    uniform float uLight0Strength;
    uniform sampler2D uTexture;
    uniform int samplerExists;

    void main() {
        vec3 normal = normalize(normalInterp);
        // Get the dirction of the light relative to the object
        vec3 lightDirection = normalize(uLight0Position - oFragPosition);

        vec3 ambient = (ambientVal * uLight0Colour) * uLight0Strength;

        // Diffuse lighting: Kd * Ld * (N dot L)
        float NdotL = max(dot(normal, lightDirection), 1.0);
        vec3 diffuse = (diffuseVal * uLight0Colour) * NdotL * uLight0Strength;

        // Specular lighting
        vec3 nCameraPosition = normalize(oCameraPosition); // Normalize the camera position
        vec3 V = nCameraPosition - oFragPosition;
        vec3 H = normalize(V + lightDirection); // H = V + L normalized

        vec3 specular = vec3(0.0,0.0,0.0);

        if (NdotL > 0.0f)
        {
            float NDotH = max(dot(normal, H), 0.0);
            float NHPow = pow(NDotH, nVal); // (N dot H)^n
            specular = (specularVal * uLight0Colour) * NHPow;
        }
        
        vec4 textureColor = texture(uTexture, oUV);
        
        //checking if a texture has been loaded for this model
        if (samplerExists == 0)
        {
            fragColor = vec4((diffuse + ambient + specular) * textureColor.rgb, alphaVal);
        }
        else
        {
            fragColor = vec4((diffuse + ambient + specular), alphaVal);
        }
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
            vertexNormal: gl.getAttribLocation(shaderProgram, 'aNormal'),
            vertexUV: gl.getAttribLocation(shaderProgram, 'aUV'),
        },
        uniformLocations: {
            projection: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
            view: gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
            model: gl.getUniformLocation(shaderProgram, 'uModelMatrix'),
            cameraPosition: gl.getUniformLocation(shaderProgram, 'uCameraPosition'),
            light0Position: gl.getUniformLocation(shaderProgram, 'uLight0Position'),
            light0Colour: gl.getUniformLocation(shaderProgram, 'uLight0Colour'),
            light0Strength: gl.getUniformLocation(shaderProgram, 'uLight0Strength'),
            sampler: gl.getUniformLocation(shaderProgram, 'uTexture'),
            ambientValue: gl.getUniformLocation(shaderProgram, "ambientVal"),
            diffuseValue: gl.getUniformLocation(shaderProgram, "diffuseVal"),
            specularValue: gl.getUniformLocation(shaderProgram, "specularVal"),
            nValue: gl.getUniformLocation(shaderProgram, "nVal"),
            alphaValue: gl.getUniformLocation(shaderProgram, "alphaVal"),
            normalMatrix: gl.getUniformLocation(shaderProgram, "normalMat"),
            samplerExists: gl.getUniformLocation(shaderProgram, "samplerExists")
            // TODO: Add additional uniforms here, such as the texture sampler
        },
    };

    // Check to see if we found the locations of our uniforms and attributes
    // Typos are a common source of failure
    if (programInfo.attribLocations.vertexPosition === -1 ||
        programInfo.attribLocations.vertexNormal === -1 ||
        programInfo.uniformLocations.projection === -1 ||
        programInfo.uniformLocations.view === -1 ||
        programInfo.uniformLocations.model === -1 ||
        programInfo.uniformLocations.light0Position === -1 ||
        programInfo.uniformLocations.light0Colour === -1 ||
        programInfo.uniformLocations.light0Strength === -1 ||
        programInfo.uniformLocations.ambientValue === -1 ||
        programInfo.uniformLocations.nValue === -1 ||
        programInfo.uniformLocations.diffuseValue === -1 ||
        programInfo.uniformLocations.specularValue === -1 ||
        programInfo.uniformLocations.normalMatrix === -1 ||
        programInfo.uniformLocations.samplerExists === -1 ||
        programInfo.uniformLocations.cameraPosition === -1) {
        printError('Shader Location Error', 'One or more of the uniform and attribute variables in the shaders could not be located');
    }

    return programInfo;
}

/************************************
 * BUFFER SETUP
 ************************************/

function initBuffers(gl, object, positionArray, normalArray, textureCoordArray, indicesArray) {

    // We have 3 vertices with x, y, and z values
    const positions = new Float32Array(positionArray);

    const normals = new Float32Array(normalArray);

    const textureCoords = new Float32Array(textureCoordArray);

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
            normal: initNormalAttribute(gl, object.programInfo, normals),
            uv: initTextureCoords(gl, object.programInfo, textureCoords),
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

function initNormalAttribute(gl, programInfo, normalArray) {

    // Create a buffer for the positions.
    const normalBuffer = gl.createBuffer();

    // Select the buffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(
        gl.ARRAY_BUFFER, // The kind of buffer this is
        normalArray, // The data in an Array object
        gl.STATIC_DRAW // We are not going to change this data, so it is static
    );

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute.
    {
        const numComponents = 3; // pull out 4 values per iteration, ie vec3
        const type = gl.FLOAT; // the data in the buffer is 32bit floats
        const normalize = false; // don't normalize between 0 and 1
        const stride = 0; // how many bytes to get from one set of values to the next
        // Set stride to 0 to use type and numComponents above
        const offset = 0; // how many bytes inside the buffer to start from

        // Set the information WebGL needs to read the buffer properly
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexNormal,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        // Tell WebGL to use this attribute
        gl.enableVertexAttribArray(
            programInfo.attribLocations.vertexNormal);
    }

    return normalBuffer;
}


function initTextureCoords(gl, programInfo, textureCoords) {
    if (textureCoords != null && textureCoords.length > 0) {
        // Create a buffer for the positions.
        const textureCoordBuffer = gl.createBuffer();

        // Select the buffer as the one to apply buffer
        // operations to from here out.
        gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

        // Now pass the list of positions into WebGL to build the
        // shape. We do this by creating a Float32Array from the
        // JavaScript array, then use it to fill the current buffer.
        gl.bufferData(
            gl.ARRAY_BUFFER, // The kind of buffer this is
            textureCoords, // The data in an Array object
            gl.STATIC_DRAW // We are not going to change this data, so it is static
        );

        // Tell WebGL how to pull out the positions from the position
        // buffer into the vertexPosition attribute.
        {
            const numComponents = 2;
            const type = gl.FLOAT; // the data in the buffer is 32bit floats
            const normalize = false; // don't normalize between 0 and 1
            const stride = 0; // how many bytes to get from one set of values to the next
            // Set stride to 0 to use type and numComponents above
            const offset = 0; // how many bytes inside the buffer to start from

            // Set the information WebGL needs to read the buffer properly
            gl.vertexAttribPointer(
                programInfo.attribLocations.vertexUV,
                numComponents,
                type,
                normalize,
                stride,
                offset
            );
            // Tell WebGL to use this attribute
            gl.enableVertexAttribArray(
                programInfo.attribLocations.vertexUV);
        }

        // TODO: Create and populate a buffer for the UV coordinates

        return textureCoordBuffer;
    }
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
