/**
 A **Camera** defines a viewpoint within a {{#crossLink "Viewer"}}Viewer{{/crossLink}}.

 ## Overview

 <ul>
 <li>You can have an unlimited number of Cameras in a {{#crossLink "Viewer"}}{{/crossLink}}.</li>
 <li>At any instant, the Camera we're looking through is the one whose {{#crossLink "Camera/active:property"}}active{{/crossLink}} property is true.</li>
 <li>Cameras can be controlled with controls such as {{#crossLink "CameraControl"}}{{/crossLink}}, {{#crossLink "KeyboardAxisCamera"}}{{/crossLink}},
 {{#crossLink "KeyboardOrbitCamera"}}{{/crossLink}}, {{#crossLink "KeyboardPanCamera"}}{{/crossLink}}, {{#crossLink "KeyboardZoomCamera"}}{{/crossLink}},
 {{#crossLink "MouseOrbitCamera"}}{{/crossLink}}, {{#crossLink "MousePanCamera"}}{{/crossLink}} and {{#crossLink "MouseZoomCamera"}}{{/crossLink}}.</li>
 </ul>

 ## Example

 In this example we define multiple Cameras looking at a {{#crossLink "TeapotObject"}}{{/crossLink}}, then periodically switch between the Cameras.

 <iframe style="width: 600px; height: 400px" src="../../examples/camera_Camera_multiple.html"></iframe>

 ````Javascript
 // Create a Viewer
 var viewer = new BIMSURFER.Viewer({ element: "myDiv" });

 // Create an object
 var box = new BIMSURFER.TeapotObject(viewer);

 // Create some Cameras
 var cameras = [

 new BIMSURFER.Camera(viewer, {
        eye: [5, 5, 5],
        active: false
    }),

 new BIMSURFER.Camera(viewer, {
        eye: [-5, 5, 5],
        active: false
    }),

 new BIMSURFER.Camera(viewer, {
        eye: [5, -5, 5],
        active: false
    }),

 new BIMSURFER.Camera(viewer, {
        eye: [5, 5, -5],
        active: false
    }),

 new BIMSURFER.Camera(viewer, {
        eye: [-5, -5, 5],
        active: false
    })
 ];

 // Periodically switch between the Cameras

 var i = -1;
 var last = -1;

 setInterval(function () {

        if (last > -1) {
            cameras[last].active = false
        }

        i = (i + 1) % (cameras.length - 1);

        cameras[i].active = true;

        last = i;

    }, 1000);
 ````

 @class Camera
 @module BIMSURFER
 @submodule camera
 @constructor
 @param [viewer] {Viewer} Parent {{#crossLink "Viewer"}}{{/crossLink}}.
 @param [cfg] {*} Configs
 @param [cfg.id] {String} Optional ID, unique among all components in the parent viewer, generated automatically when omitted.
 @param [cfg.meta] {String:Object} Optional map of user-defined metadata to attach to this Camera.
 @param [cfg.eye=[0,0,-10]] {Array of Number} Eye position.
 @param [cfg.look=[0,0,0]] {Array of Number} The position of the point-of-interest we're looking at.
 @param [cfg.up=[0,1,0]] {Array of Number} The "up" vector.
 @extends Component
 */
(function () {

    "use strict";

    /**
     * Defines a viewpoint within a {@link Viewer}.
     */
    BIMSURFER.Camera = BIMSURFER.Component.extend({

        /**
         JavaScript class name for this Component.

         @property className
         @type String
         @final
         */
        className: "BIMSURFER.Camera",

        /**
         Indicates that only one instance of a Camera may be active within
         its {{#crossLink "Viewer"}}{{/crossLink}} at a time. When a Camera is activated, that has
         a true value for this flag, then any other active Camera will be deactivated first.

         @property exclusive
         @type Boolean
         @final
         */
        exclusive: true,

        
        _init: function (cfg) {

            // The ViewerJS nodes that this Camera controls
            this._lookatNode = this.viewer.scene.getNode('theLookat');
            this._cameraNode = this.viewer.scene.getNode('theCamera');

            // Schedule update of view and projection transforms for next tick
            this._lookatNodeDirty = true;
            this._cameraNodeDirty = true;

            // Camera not at rest now
            this._rested = false;

            this._tickSub = null;


            // TODO: compute/orthogolalize 'up'

            this.eye = cfg.eye;
            this.look = cfg.look;
            this.up = cfg.up;
            this.aspect = cfg.aspect;
            this.fovy = cfg.fovy;
            this.near = cfg.near;
            this.far = cfg.far;
            this.screenPan = cfg.screenPan;

            this.active = cfg.active !== false;
        },

        /**
         * Rotate 'eye' about 'look', around the 'up' vector
         *
         * @param {Number} angle Angle of rotation in degrees
         */
        rotateEyeY: function (angle) {

            // Get 'look' -> 'eye' vector
            var eye2 = BIMSURFER.math.subVec3(this._eye, this._look, []);

            // Rotate 'eye' vector about 'up' vector
            var mat = BIMSURFER.math.rotationMat4v(angle * 0.0174532925, this._up);
            eye2 = BIMSURFER.math.transformPoint3(mat, eye2, []);

            // Set eye position as 'look' plus 'eye' vector
            this._eye = BIMSURFER.math.addVec3(eye2, this._look, []);

            this._lookatNodeDirty = true;
        },

        /**
         * Rotate 'eye' about 'look' around the X-axis
         *
         * @param {Number} angle Angle of rotation in degrees
         */
        rotateEyeX: function (angle) {

            // Get 'look' -> 'eye' vector
            var eye2 = BIMSURFER.math.subVec3(this._eye, this._look, []);

            // Get orthogonal vector from 'eye' and 'up'
            var left = BIMSURFER.math.cross3Vec3(BIMSURFER.math.normalizeVec3(eye2, []), BIMSURFER.math.normalizeVec3(this._up, []));

            // Rotate 'eye' vector about orthogonal vector
            var mat = BIMSURFER.math.rotationMat4v(angle * 0.0174532925, left);
            eye2 = BIMSURFER.math.transformPoint3(mat, eye2, []);

            // Set eye position as 'look' plus 'eye' vector
            this._eye = BIMSURFER.math.addVec3(eye2, this._look, []);

            // Rotate 'up' vector about orthogonal vector
            this._up = BIMSURFER.math.transformPoint3(mat, this._up, []);

            this._lookatNodeDirty = true;
        },

        /**
         * Rotate 'look' about 'eye', around the 'up' vector
         *
         * <p>Applies constraints added with {@link #addConstraint}.</p>
         *
         * @param {Number} angle Angle of rotation in degrees
         */
        rotateLookY: function (angle) {

            // Get 'look' -> 'eye' vector
            var look2 = BIMSURFER.math.subVec3(this._look, this._eye, []);

            // Rotate 'look' vector about 'up' vector
            var mat = BIMSURFER.math.rotationMat4v(angle * 0.0174532925, this._up);
            look2 = BIMSURFER.math.transformPoint3(mat, look2, []);

            // Set look position as 'look' plus 'eye' vector
            this._look = BIMSURFER.math.addVec3(look2, this._eye, []);

            this._lookatNodeDirty = true;
        },

        /**
         * Rotate 'eye' about 'look' around the X-axis
         *
         * @param {Number} angle Angle of rotation in degrees
         */
        rotateLookX: function (angle) {

            // Get 'look' -> 'eye' vector
            var look2 = BIMSURFER.math.subVec3(this._look, this._eye, []);

            // Get orthogonal vector from 'eye' and 'up'
            var left = BIMSURFER.math.cross3Vec3(BIMSURFER.math.normalizeVec3(look2, []), BIMSURFER.math.normalizeVec3(this._up, []));

            // Rotate 'look' vector about orthogonal vector
            var mat = BIMSURFER.math.rotationMat4v(angle * 0.0174532925, left);
            look2 = BIMSURFER.math.transformPoint3(mat, look2, []);

            // Set eye position as 'look' plus 'eye' vector
            this._look = BIMSURFER.math.addVec3(look2, this._eye, []);

            // Rotate 'up' vector about orthogonal vector
            this._up = BIMSURFER.math.transformPoint3(mat, this._up, []);

            this._lookatNodeDirty = true;
        },

        /**
         * Pans the camera along X and Y axis.
         * @param pan The pan vector
         */
        pan: function (pan) {

            // Get 'look' -> 'eye' vector
            var eye2 = BIMSURFER.math.subVec3(this._eye, this._look, []);

            // Building this pan vector
            var vec = [0, 0, 0];
            var v;

            if (pan[0] !== 0) {

                // Pan along orthogonal vector to 'look' and 'up'

                var left = BIMSURFER.math.cross3Vec3(BIMSURFER.math.normalizeVec3(eye2, []), BIMSURFER.math.normalizeVec3(this._up, []));

                v = BIMSURFER.math.mulVec3Scalar(left, pan[0]);

                vec[0] += v[0];
                vec[1] += v[1];
                vec[2] += v[2];
            }

            if (pan[1] !== 0) {

                // Pan along 'up' vector

                v = BIMSURFER.math.mulVec3Scalar(BIMSURFER.math.normalizeVec3(this._up, []), pan[1]);

                vec[0] += v[0];
                vec[1] += v[1];
                vec[2] += v[2];
            }

            if (pan[3] !== 0) {

                // Pan along 'eye'- -> 'look' vector

                v = BIMSURFER.math.mulVec3Scalar(BIMSURFER.math.normalizeVec3(eye2, []), pan[2]);

                vec[0] += v[0];
                vec[1] += v[1];
                vec[2] += v[2];
            }

            this._eye = BIMSURFER.math.addVec3(this._eye, vec, []);
            this._look = BIMSURFER.math.addVec3(this._look, vec, []);

            this._lookatNodeDirty = true;
        },

        /**
         * Increments/decrements zoom factor, ie. distance between eye and look.
         * @param delta
         */
        zoom: function (delta) {

            var vec = BIMSURFER.math.subVec3(this._eye, this._look, []); // Get vector from eye to look
            var lenLook = Math.abs(BIMSURFER.math.lenVec3(vec, []));    // Get len of that vector
            var newLenLook = Math.abs(lenLook + delta);         // Get new len after zoom

            var dir = BIMSURFER.math.normalizeVec3(vec, []);  // Get normalised vector
            this._eye = BIMSURFER.math.addVec3(this._look, BIMSURFER.math.mulVec3Scalar(dir, newLenLook), []);

            this._lookatNodeDirty = true;
        },

        _props: {

            /**
             * Flag which indicates whether this Camera is active or not.
             *
             * Fires an {{#crossLink "Camera/active:event"}}{{/crossLink}} event on change.
             *
             * @property active
             * @type Boolean
             */
            active: {

                set: function (value) {

                    if (this._active === value) {
                        return;
                    }

                    if (value) {

                        this._lookatNodeDirty = true;
                        this._cameraNodeDirty = true;

                        var self = this;

                        this._tickSub = this.viewer.on("tick",
                            function () {

                                if (self._lookatNodeDirty) {

                                    // View transform update scheduled for viewer graph

                                    self._lookatNode.setEye(BIMSURFER.math.vec3ArrayToObj(self._eye));
                                    self._lookatNode.setLook(BIMSURFER.math.vec3ArrayToObj(self._look));
                                    self._lookatNode.setUp(BIMSURFER.math.vec3ArrayToObj(self._up));

                                    // Camera not at rest now
                                    self._rested = false;

                                    // Viewer camera position now up to date
                                    self._lookatNodeDirty = false;

                                } else {

                                    // Else camera position now at rest

                                    if (!self._rested) {
                                        self._rested = true;
                                    }
                                }

                                if (self._cameraNodeDirty) {

                                    // Projection update scheduled for viewer graph

                                    // Update the viewer graph

                                    self._cameraNode.set({
                                        optics: {
                                            type: "perspective",
                                            fovy: self.fovy,
                                            near: self.near,
                                            far: self.far
                                        }
                                    });

                                    // Viewer projection now up to date
                                    self._cameraNodeDirty = false;
                                }
                            });

                    } else {

                        this.viewer.off(this._tickSub);
                    }

                    /**
                     * Fired whenever this Camera's {{#crossLink "Camera/active:property"}}{{/crossLink}} property changes.
                     * @event active
                     * @param value The property's new value
                     */
                    this.fire('active', this._active = value);
                },

                get: function () {
                    return this._active;
                }
            },

            aspect: {

                set: function (value) {
                    this._aspect = value || 1.0;
                    this._cameraNodeDirty = true;
                },

                get: function () {
                    return this._aspect;
                }
            },

            /**
             * Position of the eye.
             * Fires an {{#crossLink "Camera/eye:event"}}{{/crossLink}} event on change.
             * @property eye
             * @default [0,0,-10]
             * @type Array(Number)
             */
            eye: {

                set: function (value) {
                    if (!this._eye) {
                        this._eye = [0, 0, 0];
                    }
                    this._eye[0] = value ? value[0] : 0;
                    this._eye[1] = value ? value[1] : 1;
                    this._eye[2] = value ? value[2] : -10;

                    this._lookatNodeDirty = true;
                },

                get: function () {
                    return this._eye;
                }
            },

            /**
             * Position of the point-of-interest.
             * Fires a {{#crossLink "Camera/look:event"}}{{/crossLink}} event on change.
             * @property look
             * @default [0,0,0]
             * @type Array(Number)
             */
            look: {

                set: function (value) {
                    if (!this._look) {
                        this._look = [0, 0, 0];
                    }
                    this._look[0] = value ? value[0] : 0;
                    this._look[1] = value ? value[1] : 0;
                    this._look[2] = value ? value[2] : 0;

                    this._lookatNodeDirty = true;
                },

                get: function () {
                    return this._look;
                }
            },

            /**
             * Direction of the "up" vector.
             * Fires an {{#crossLink "Camera/up:event"}}{{/crossLink}} event on change.
             * @property up
             * @default [0,1,0]
             * @type Array(Number)
             */
            up: {

                set: function (value) {
                    if (!this._up) {
                        this._up = [0, 0, 0];
                    }
                    this._up[0] = value ? value[0] : 0;
                    this._up[1] = value ? value[1] : 1;
                    this._up[2] = value ? value[2] : 0;

                    this._lookatNodeDirty = true;
                },

                get: function () {
                    return this._up;
                }
            },

            fovy: {

                set: function (value) {
                    this._fovy = value || 60;
                    this._cameraNodeDirty = true;
                },

                get: function () {
                    return this._fovy;
                }
            },

            near: {

                set: function (value) {
                    this._near = value || 0.1;
                    this._cameraNodeDirty = true;
                },

                get: function () {
                    return this._near;
                }
            },

            far: {

                set: function (value) {
                    this._far = value || 10000;
                    this._cameraNodeDirty = true;
                },

                get: function () {
                    return this._far;
                }
            },

            screenPan: {

                set: function (value) {
                    this._screenPan = value || [0, 0];
                    this._cameraNodeDirty = true;
                },

                get: function () {
                    return this._screenPan;
                }
            }
        },

        _destroy: function () {
            this.active = false;
        }

    });

})();