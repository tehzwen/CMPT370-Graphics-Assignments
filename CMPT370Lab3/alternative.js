// Mozilla's tutorial on WebGL was used as a base for this example.
// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial
// The original source is here: https://github.com/mdn/webgl-examples

function main() {

    console.log("Setting up the canvas");

    // Find the canavas tag in the HTML document
    const canvas = document.querySelector("#assignmentCanvas");

    // Initialize the WebGL2 context
    // The `gl` variable represents the context for which we access WebGL.
    // By calling it `gl`, the calls are similar in syntax to the OpenGL ES API.
    const gl = canvas.getContext("webgl2");

    // Only continue if WebGL2 is available and working
    if (gl === null) {
        printError('WebGL 2 not supported by your browser',
            'Check to see you are using a <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API#WebGL_2_2" class="alert-link">modern browser</a>.');
        return;
    }

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
            let inputTriangles = JSON.parse(data);
            console.log("Initializing program");

            // Initialize shader
            var programInfo = intializeShaderProgram(gl);

            //initialize arrays for different data types that we will need
            let indiciesArray = [], totalArray = [], indexCounter = 0;

            let tempColorArray = [];
            for (let i = 0; i < inputTriangles.length; i++) {
                for (let t = 0; t < inputTriangles[i].triangles.length; t++) {
                    let tempIndicies = inputTriangles[i].triangles[t].map((val) => {
                        //account for existing indices and add their count to the indices here
                        return val += indexCounter;
                    });
                    //add the indices to the array
                    indiciesArray = indiciesArray.concat(tempIndicies);
                }

                //increment our index counter by how many vertices were added
                indexCounter += inputTriangles[i].vertices.length;
                //iterate through the vertices
                for (let j = 0; j < inputTriangles[i].vertices.length; j++) {
                    totalArray = totalArray.concat(inputTriangles[i].vertices[j]);
                    tempColorArray = [...inputTriangles[i].material.diffuse];
                    tempColorArray.push(1.0);
                    totalArray = totalArray.concat(tempColorArray);
                }
            }

            //main call to create buffers using data extracted from JSON file
            var buffers = initBuffers(gl, programInfo, totalArray, indiciesArray);

            console.log("Starting rendering loop");

            // A variable for keeping track of time between frames
            var then = 0.0;

            // This function is called when we want to render a frame to the canvas
            function render(now) {
                now *= 0.001; // convert to seconds
                const deltaTime = now - then;
                then = now;

                // Draw our scene
                drawScene(gl, deltaTime, programInfo, buffers);

                // Request another frame when this one is done
                requestAnimationFrame(render);
            }

            // Draw the scene
            requestAnimationFrame(render);
        }).catch((e) => {
            console.error(e);
        });

    });
}


/**
 * Draws the scene. Should be called every frame
 * 
 * @param  {} gl WebGL2 context
 * @param {number} deltaTime Time between each rendering call
 * @param  {} programInfo Custom object containing shader program and locations
 * @param  {} buffers Buffer data to use to draw shapes
 */
function drawScene(gl, deltaTime, programInfo, buffers) {
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

    // Choose to use our shader
    gl.useProgram(programInfo.program);

    {
        // Bind the buffer we want to draw
        gl.bindVertexArray(buffers.vao);

        // Draw the object
        const offset = 0; // Number of elements to skip before starting
        gl.drawElements(gl.TRIANGLES, buffers.numVertices, gl.UNSIGNED_SHORT, offset);
    }
}

function intializeShaderProgram(gl) {

    // Vertex shader source code
    const vsSource =
        `#version 300 es
        in vec3 aPosition;
        in vec4 aColor;

        out vec4 oColor;

        void main() {
            // Position needs to be a vec4 with w as 1.0
            gl_Position = vec4(aPosition, 1.0);

            // Pass the colour to the fragment shader
            oColor = aColor;
        }
        `;

    // Fragment shader source code
    const fsSource =
        `#version 300 es
        precision highp float;

        in vec4 oColor;

        out vec4 fragColor;

        void main() {
            fragColor = oColor;
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
            vertexColour: gl.getAttribLocation(shaderProgram, 'aColor'),
        }
    };

    // Check to see if we found the locations of our uniforms and attributes
    // Typos are a common source of failure
    if (programInfo.attribLocations.vertexPosition === -1 ||
        programInfo.attribLocations.vertexColour === -1) {
        printError('Shader Location Error', 'One or more of the uniform and attribute variables in the shaders could not be located');
    }
    return programInfo;
}


/**
 * Initialize our buffer
 * 
 * @param  {} gl WebGL2 context
 * @param  {} programInfo Custom object containing shader program and locations
 * @param  {} inputVertices Array containing the vertices from the inputted file
 * @param  {} inputIndices Array containing the indicies from the inputted file
 * @param  {} inputColours Array containing the colours from the inputted file
 * @returns {} An object containing the buffers
 */
function initBuffers(gl, programInfo, inputValues, inputIndices) {

    // Create array that contains vertices and colors
    const totalArray = new Float32Array(inputValues);

    // We are using gl.UNSIGNED_SHORT to enumerate the indices
    const indicesArray = new Uint16Array(inputIndices);

    // Allocate and assign a Vertex Array Object to our handle
    var vertexArrayObject = gl.createVertexArray();

    // Bind our Vertex Array Object as the current used object
    gl.bindVertexArray(vertexArrayObject);
    initTotalBuffer(gl, programInfo, totalArray);
    initIndexBuffer(gl, indicesArray);

    return {
        vao: vertexArrayObject,
        numVertices: indicesArray.length, //use the length of the indiciesArray
    };
}

function initTotalBuffer(gl, programInfo, valueArray) {
    const totalBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, totalBuffer);

    gl.bufferData(gl.ARRAY_BUFFER, valueArray, gl.STATIC_DRAW);

    {
        const numComponents = 3; // pull out 3 values per iteration, ie vec3
        const type = gl.FLOAT; // the data in the buffer is 32bit floats
        const normalize = false; // don't normalize between 0 and 1
        const stride = 28; // how many bytes to get from one set of values to the next
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

    {
        const numComponents = 4; // pull out 4 values per iteration, ie vec4
        const type = gl.FLOAT; // the data in the buffer is 32bit floats
        const normalize = false; // don't normalize between 0 and 1
        const stride = 28; // how many bytes to get from one set of values to the next
        // Set stride to 0 to use type and numComponents above
        const offset = 12; // how many bytes inside the buffer to start from

        // Set the information WebGL needs to read the buffer properly
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexColour,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        // Tell WebGL to use this attribute
        gl.enableVertexAttribArray(
            programInfo.attribLocations.vertexColour);
    }

    return totalBuffer;
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
