/*
 * Copyright (c) 2014 MKLab. All rights reserved.
 * Copyright (c) 2014 Sebastian Schleemilch.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true */
/*global define, $, _, window, app, type, document, cpp */

define(function (require, exports, module) {
    "use strict";

    var _CPP_CODE_GEN_H = "h";
    var _CPP_CODE_GEN_CPP = "cpp";

    var _CPP_PUBLIC_MOD = "public";
    var _CPP_PROTECTED_MOD = "protected";
    var _CPP_PRIVATE_MOD = "private";

    var Repository     = app.getModule("core/Repository"),
        ProjectManager = app.getModule("engine/ProjectManager"),
        Engine         = app.getModule("engine/Engine"),
        FileSystem     = app.getModule("filesystem/FileSystem"),
        FileUtils      = app.getModule("file/FileUtils"),
        Async          = app.getModule("utils/Async"),
        UML            = app.getModule("uml/UML");

    var CodeGenUtils = require("CodeGenUtils");

    var copyrightHeader = "/* Test header @ toori67 \n * This is Test\n * also test\n * also test again\n */";
    var versionString = "v0.0.1";


    /**
     * Cpp code generator
     * @constructor
     *
     * @param {type.UMLPackage} baseModel
     * @param {string} basePath generated files and directories to be placed
     *
     */
    function CppCodeGenerator(baseModel, basePath) {

        /** @member {type.Model} */
        this.baseModel = baseModel;

        /** @member {string} */
        this.basePath = basePath;

        var doc = "";
        if (ProjectManager.getProject().name && ProjectManager.getProject().name.length > 0) {
            doc += "\nProject " + ProjectManager.getProject().name;
        }
        if (ProjectManager.getProject().author && ProjectManager.getProject().author.length > 0) {
            doc += "\n@author " + ProjectManager.getProject().author;
        }
        if (ProjectManager.getProject().version && ProjectManager.getProject().version.length > 0) {
            doc += "\n@version " + ProjectManager.getProject().version;
        }
        copyrightHeader = this.getDocuments(doc);
    }

    /**
     * Return Indent String based on options
     * @param {Object} options
     * @return {string}
     */
    CppCodeGenerator.prototype.getIndentString = function (options) {
        if (options.useTab) {
            return '\t';
        } else {

            var i, len, indent = [];
            for (i = 0, len = options.indentSpaces; i < len; i++) {
                indent.push(" ");
            }
            return indent.join("");
        }
    };


    CppCodeGenerator.prototype.generate = function (elem, path, options) {

        this.genOptions = options;

        var getFilePath = function (extenstions) {
            var abs_path = path + "/" + elem.name + ".";
            if (extenstions === _CPP_CODE_GEN_H) {
                abs_path += _CPP_CODE_GEN_H;
            } else {
                abs_path += _CPP_CODE_GEN_CPP;
            }
            return abs_path;
        };

        var writeEnumeration = function (codeWriter, elem, cppCodeGen) {
            var i;
            var modifierList = cppCodeGen.getModifiers(elem);
            var modifierStr = "";
            for (i = 0; i < modifierList.length; i++) {
                modifierStr += modifierList[i] + " ";
            }
            codeWriter.writeLine(modifierStr + "enum " + elem.name + " { "  + _.pluck(elem.literals, 'name').join(", ")  + " };");
        };

        var writeClassHeader = function (codeWriter, elem, cppCodeGen) {
            var i;
            var write = function (items) {
                var i;
                for (i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item instanceof type.UMLAttribute && item.stereotype === 'define') {
                        codeWriter.writeLine(cppCodeGen.getDefineFromStereotypedMemberVariable(item));
                    } else if (item instanceof type.UMLAttribute ||  item instanceof type.UMLAssociationEnd) { // if write member variable
                        codeWriter.writeLine(cppCodeGen.getMemberVariable(item));
                    } else if (item instanceof type.UMLOperation) { // if write method
                        codeWriter.writeLine(cppCodeGen.getMethod(item, false));
                    } else if (item instanceof type.UMLClass) {
                        writeClassHeader(codeWriter, item, cppCodeGen);
                    } else if (item instanceof type.UMLEnumeration) {
                        writeEnumeration(codeWriter, item, cppCodeGen);
                    }
                }
            };
            var writeInheritance = function (elem) {
                var inheritString = ": ";
                var genList = cppCodeGen.getSuperClasses(elem);

                if (genList.length === 0) {
                    return "";
                }

                var i;
                var term = [];


                for (i = 0; i < genList.length; i++) {
                    var generalization = genList[i];
                    // public AAA, private BBB
                    term.push(generalization.visibility + " " + generalization.target.name);
                }
                inheritString += term.join(", ");
                return inheritString;
            };

            // member variable
            var memberAttr = elem.attributes.slice(0);
            var associations = Repository.getRelationshipsOf(elem, function (rel) {
                return (rel instanceof type.UMLAssociation);
            });
            for (i = 0; i < associations.length; i++) {
                var asso = associations[i];
                if (asso.end1.reference === elem && asso.end2.navigable === true && asso.end2.name.length !== 0) {
                    memberAttr.push(asso.end2);
                } else if (asso.end2.reference === elem && asso.end1.navigable === true && asso.end1.name.length !== 0) {
                    memberAttr.push(asso.end1);
                }
            }

            // method
            var methodList = elem.operations.slice(0);
            var innerElement = [];
            for (i = 0; i < elem.ownedElements.length; i++) {
                var element = elem.ownedElements[i];
                if (element instanceof type.UMLClass || element instanceof type.UMLEnumeration) {
                    innerElement.push(element);
                }
            }

            var allMembers = memberAttr.concat(methodList).concat(innerElement);

            var classfiedAttributes = cppCodeGen.classifyVisibility(allMembers);

            //sorter that sorts attributes by type, putting UMLEnumerations at top, followed by static UMLAttributes, followed by non-static UMLAttributes, then UMLOperations
            var enumsToTopSorter =
                function(a, b) {
                    if (a instanceof type.UMLEnumeration) {
                        return -1;
                    }

                    if (a instanceof type.UMLAttribute && b instanceof type.UMLAttribute && a.isStatic === true && b.isStatic !== true) {
                        return -1;
                    }

                    if (a instanceof type.UMLAttribute && b instanceof type.UMLOperation) {
                        return -1;
                    }

                    return 1;
                };
           

            //reorder attributes to bubble enums up to top in each scope (in case declaring subsequent attributes or operations that rely on a declared enum)
            classfiedAttributes._public.sort(enumsToTopSorter);
            classfiedAttributes._protected.sort(enumsToTopSorter);
            classfiedAttributes._private.sort(enumsToTopSorter);

            var finalModifier = "";
            if (elem.isFinalSpecialization === true || elem.isLeaf === true) {
                finalModifier = " final ";
            }
            var templatePart = cppCodeGen.getTemplateParameter(elem);
            if (templatePart.length > 0) {
                codeWriter.writeLine(templatePart);
            }

            var writeStereotypedPreClassItems = function(stereotype) {
                var itemWritten = false;

                var writeScopedItems = function(scopedItems) {
                    for (i = 0; i < scopedItems.length; i++) {
                        if (scopedItems[i].stereotype === stereotype) {
                            write([scopedItems[i]]);
                            // remove "extern" stereotyped attributes from array, so they're not written in class body, too
                            scopedItems.splice(i, 1);
                            itemWritten = true;
                        }
                    }

                };

                writeScopedItems(classfiedAttributes._public);
                writeScopedItems(classfiedAttributes._protected);
                writeScopedItems(classfiedAttributes._private);

                if (itemWritten === true) {
                    codeWriter.writeLine();
                }
            };

            writeStereotypedPreClassItems("define");
            writeStereotypedPreClassItems("extern");

            // only write class declaration if the class is not 'noclass' stereotyped
            if (elem.stereotype === "noclass") {
                write(classfiedAttributes._public);
                write(classfiedAttributes._protected);
                write(classfiedAttributes._private);
            //if class is stereotyped as 'struct', then generate code for a structure
            } else if (elem.stereotype === "struct") {
                codeWriter.writeLine("typedef struct " + elem.name + " {");
                codeWriter.indent();
                write(classfiedAttributes._public);
                write(classfiedAttributes._protected);
                write(classfiedAttributes._private);
                codeWriter.outdent();
                codeWriter.writeLine("} " + elem.name + ";");
            } else {
                codeWriter.writeLine("class " + elem.name + finalModifier + writeInheritance(elem) + " {");
                if (classfiedAttributes._public.length > 0) {
                    codeWriter.writeLine("public: ");
                    codeWriter.indent();
                    write(classfiedAttributes._public);
                    codeWriter.outdent();
                }
                if (classfiedAttributes._protected.length > 0) {
                    codeWriter.writeLine("protected: ");
                    codeWriter.indent();
                    write(classfiedAttributes._protected);
                    codeWriter.outdent();
                }
                if (classfiedAttributes._private.length > 0) {
                    codeWriter.writeLine("private: ");
                    codeWriter.indent();
                    write(classfiedAttributes._private);
                    codeWriter.outdent();
                }

                codeWriter.writeLine("};");
            }
        };

        var writeClassBody = function (codeWriter, elem, cppCodeGen) {
            var i = 0;
            var item;
            var writeClassMethod = function (elemList) {

                for (i = 0; i < elemList._public.length; i++) {
                    item = elemList._public[i];
                    if (item instanceof type.UMLOperation) { // if write method
                        codeWriter.writeLine(cppCodeGen.getMethod(item, true));
                    } else if (item instanceof type.UMLClass) {
                        writeClassBody(codeWriter, item, cppCodeGen);
                    }
                }

                for (i = 0; i < elemList._protected.length; i++) {
                    item = elemList._protected[i];
                    if (item instanceof type.UMLOperation) { // if write method
                        codeWriter.writeLine(cppCodeGen.getMethod(item, true));
                    } else if (item instanceof type.UMLClass) {
                        writeClassBody(codeWriter, item, cppCodeGen);
                    }
                }

                for (i = 0; i < elemList._private.length; i++) {
                    item = elemList._private[i];
                    if (item instanceof type.UMLOperation) { // if write method
                        codeWriter.writeLine(cppCodeGen.getMethod(item, true));
                    } else if (item instanceof type.UMLClass) {
                        writeClassBody(codeWriter, item, cppCodeGen);
                    }
                }
            };

            var writeClassAttributes = function(elemList) {
                var _writeClassAttributes = function(_elemList) {
                    for (i = 0; i < _elemList.length; i++) {
                        item = _elemList[i];
                        if (item instanceof type.UMLAttribute) {
                            codeWriter.writeLine(cppCodeGen.getMemberVariable(item, false));
                        }
                    }
                };

                //sorter that sorts attributes by their isStatic property
                var staticssToTopSorter = function(a, b) {
                    if (a.isStatic) {
                        return -1
                    }

                    return 1;
                };

                _writeClassAttributes(elemList._public.sort(staticssToTopSorter));
                _writeClassAttributes(elemList._protected.sort(staticssToTopSorter));
                _writeClassAttributes(elemList._private.sort(staticssToTopSorter));
            };

            // parsing class
            var methodList = cppCodeGen.classifyVisibility(elem.operations.slice(0));
            //don't generate struct docs in body, as no struct info is generated in body
            if(_.isString(elem.documentation) && !elem.stereotype == 'struct') {
                var docs = elem.name + " implementation\n\n";
                    docs += elem.documentation;
                codeWriter.writeLine(cppCodeGen.getDocuments(docs));
            }

            writeClassAttributes(cppCodeGen.classifyVisibility(elem.attributes.slice(0)));
            writeClassMethod(methodList);

            // parsing nested class
            var innerClass = [];
            for (i = 0; i < elem.ownedElements.length; i++) {
                var element = elem.ownedElements[i];
                //don't render nested class in class body if it's stereotyped 'struct' (struct will be rendered in class header)
                if (element instanceof type.UMLClass && elem.stereotype !== "struct") {
                    innerClass.push(element);
                }
            }
            if (innerClass.length > 0) {
                innerClass = cppCodeGen.classifyVisibility(innerClass);
                writeClassMethod(innerClass);
            }

        };

        var result = new $.Deferred(),
        self = this,
        fullPath,
        directory,
        file;

        // Package -> as namespace or not
        if (elem instanceof type.UMLPackage) {
            fullPath = path + "/" + elem.name;
            directory = FileSystem.getDirectoryForPath(fullPath);
            directory.create(function (err, stat) {
                if (!err || err === "AlreadyExists") {
                    Async.doSequentially(
                        elem.ownedElements,
                        function (child) {
                            return self.generate(child, fullPath, options);
                        },
                        false
                    ).then(result.resolve, result.reject);
                } else {
                    result.reject(err);
                }
            });

        } else if (elem instanceof type.UMLClass) {

            // generate class header elem_name.h
            file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
            FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeClassHeader), true).then(result.resolve, result.reject);

            // generate class cpp elem_name.cpp
            if (options.genCpp) {
                file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_CPP));
                FileUtils.writeText(file, this.writeBodySkeletonCode(elem, options, writeClassBody), true).then(result.resolve, result.reject);
            }

        } else if (elem instanceof type.UMLInterface) {
            /**
             * interface will convert to class which only contains virtual method and member variable.
             */
            // generate interface header ONLY elem_name.h
            file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
            FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeClassHeader), true).then(result.resolve, result.reject);

        } else if (elem instanceof type.UMLEnumeration) {
            // generate enumeration header ONLY elem_name.h

            file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
            FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeEnumeration), true).then(result.resolve, result.reject);
        } else {
            result.resolve();
        }
        return result.promise();
    };

    /**
     * Write *.h file. Implement functor to each uml type.
     * Returns text
     *
     * @param {Object} elem
     * @param {Object} options
     * @param {Object} functor
     * @return {Object} string
     */
    CppCodeGenerator.prototype.writeHeaderSkeletonCode = function (elem, options, funct) {
        var headerString = "_" + elem.name.toUpperCase() + "_H";
        var codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
        var includePart = this.getIncludePart(elem);
        codeWriter.writeLine(copyrightHeader);
        codeWriter.writeLine();
        codeWriter.writeLine("#ifndef " + headerString);
        codeWriter.writeLine("#define " + headerString);
        codeWriter.writeLine();

        if (includePart.length > 0) {
            codeWriter.writeLine(includePart);
            codeWriter.writeLine();
        }
        funct(codeWriter, elem, this);

        codeWriter.writeLine();
        codeWriter.writeLine("#endif //" + headerString);
        return codeWriter.getData();
    };

    /**
     * Write *.cpp file. Implement functor to each uml type.
     * Returns text
     *
     * @param {Object} elem
     * @param {Object} options
     * @param {Object} functor
     * @return {Object} string
     */
    CppCodeGenerator.prototype.writeBodySkeletonCode = function (elem, options, funct) {
        var codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));

        codeWriter.writeLine(copyrightHeader);
        codeWriter.writeLine();
        codeWriter.writeLine("#include \"" +  elem.name + ".h\"");
        codeWriter.writeLine();

        var dependencies = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLDependency);
        });

        var trackingHeader = function (elem, target) {
            var header = "";
            var elementString = "";
            var targetString = "";
            var i;


            while (elem._parent._parent !== null) {
                elementString = (elementString.length !== 0) ?  elem.name + "/" + elementString : elem.name;
                elem = elem._parent;
            }
            while (target._parent._parent !== null) {
                targetString = (targetString.length !== 0) ?  target.name + "/" + targetString : target.name;
                target = target._parent;
            }

            var idx;
            for (i = 0; i < (elementString.length < targetString.length) ? elementString.length : targetString.length; i++) {

                if (elementString[i] === targetString[i]) {
                    if (elementString[i] === '/' && targetString[i] === '/') {
                        idx = i + 1;
                    }
                } else {
                    break;
                }
            }
            // remove common path
            elementString = elementString.substring(idx, elementString.length);
            targetString = targetString.substring(idx, targetString.length);

            for (i = 0; i < elementString.split('/').length - 1; i++) {
                header += "../";
            }
            header += targetString;

            return header;
        };


        var includeString = "";
        var i;

        // check for UMLArtifactInstance dependencies, generating #include statements for them as external include files
        for (i = 0; i < dependencies.length; i++) {
            var dep = dependencies[i];
            if (dep.source === elem && ((dep.target instanceof type.UMLArtifactInstance && dep.stereotype !== "hinclude") || dep.stereotype === "include")) {
                includeString += "#include \"" + trackingHeader(elem, dep.target) + ".h\"\n";
            }
        }

        codeWriter.writeLine(includeString);

        codeWriter.writeLine();

        funct(codeWriter, elem, this);

        return codeWriter.getData();
    };

    /**
     * Parsing template parameter
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getTemplateParameter = function (elem) {
        var i;
        var returnTemplateString = "";
        if (elem.templateParameters.length <= 0) {
            return returnTemplateString;
        }
        var term = [];
        returnTemplateString = "template<";

        for (i = 0; i < elem.templateParameters.length; i++) {
            var template = elem.templateParameters[i];
            var templateStr = template.parameterType + " ";
            templateStr += template.name + " ";
            if (template.defaultValue.length !== 0) {
                templateStr += " = " + template.defaultValue;
            }
            term.push(templateStr);
        }
        returnTemplateString += term.join(", ");
        returnTemplateString += ">";
        return returnTemplateString;
    };

    /**
     * Parsing include header
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getIncludePart = function (elem) {

        var i;
        var trackingHeader = function (elem, target) {
            var header = "";
            var elementString = "";
            var targetString = "";
            var i;


            while (elem._parent._parent !== null) {
                elementString = (elementString.length !== 0) ?  elem.name + "/" + elementString : elem.name;
                elem = elem._parent;
            }
            while (target._parent._parent !== null) {
                targetString = (targetString.length !== 0) ?  target.name + "/" + targetString : target.name;
                target = target._parent;
            }

            var idx;
            for (i = 0; i < (elementString.length < targetString.length) ? elementString.length : targetString.length; i++) {

                if (elementString[i] === targetString[i]) {
                    if (elementString[i] === '/' && targetString[i] === '/') {
                        idx = i + 1;
                    }
                } else {
                    break;
                }
            }
            // remove common path
            elementString = elementString.substring(idx, elementString.length);
            targetString = targetString.substring(idx, targetString.length);

            for (i = 0; i < elementString.split('/').length - 1; i++) {
                header += "../";
            }
            header += targetString;

            return header;
        };


        var headerString = "";
        if (Repository.getRelationshipsOf(elem).length <= 0) {
            return "";
        }
        var associations = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLAssociation);
        });
        var realizations = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLInterfaceRealization || rel instanceof type.UMLGeneralization);
        });
        var dependencies = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLDependency);
        });

        // check for 'hinclude'-stereotyped Dependencies, generating #include statements for them in the '.h' file (by default, Dependency includes are done in the implementation .cpp file)
        for (i = 0; i < dependencies.length; i++) {
            var dep = dependencies[i];
            if (dep.source === elem && dep.stereotype === "hinclude") {
                headerString += "#include \"" + trackingHeader(elem, dep.target) + ".h\"\n";
            }
        }

        // check for interface or class
        for (i = 0; i < realizations.length; i++) {
            var realize = realizations[i];
            if (realize.target === elem) {
                continue;
            }
            headerString += "#include \"" + trackingHeader(elem, realize.target) + ".h\"\n";
        }

        // check for member variable
        for (i = 0; i < associations.length; i++) {
            var asso = associations[i];
            var target;
            if (asso.end1.reference === elem && asso.end2.navigable === true && asso.end2.name.length !== 0) {
                target = asso.end2.reference;
            } else if (asso.end2.reference === elem && asso.end1.navigable === true && asso.end1.name.length !== 0) {
                target = asso.end1.reference;
            } else {
                continue;
            }
            if (target === elem) {
                continue;
            }
            headerString += "#include \"" + trackingHeader(elem, target) + ".h\"\n";
        }

        return headerString;
    };

    /**
     * Classfy method and attribute by accessor.(public, private, protected)
     *
     * @param {Object} items
     * @return {Object} list
     */
    CppCodeGenerator.prototype.classifyVisibility = function (items) {
        var public_list = [];
        var protected_list = [];
        var private_list = [];
        var i;
        for (i = 0; i < items.length; i++) {

            var item = items[i];
            var visib = this.getVisibility(item);

            if ("public" === visib) {
                public_list.push(item);
            } else if ("private" === visib) {
                private_list.push(item);
            } else {
                // if modifier not setted, consider it as protected
                protected_list.push(item);
            }
        }
        return {
            _public : public_list,
            _protected: protected_list,
            _private: private_list
        };
    };

    /**
     * generate #define from attributes[i] stereotyped as 'define'
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getDefineFromStereotypedMemberVariable = function (elem) {
        if (elem.name.length > 0) {
            var terms = [];
            // doc
            var docs = this.getDocuments(elem.documentation);
            // #define
            terms.push("#define");
            // name
            terms.push(elem.name);

            return (docs + terms.join(" "));
        }
    };

    /**
     * generate variables from attributes[i]
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getMemberVariable = function (elem, isHeader) {
        //default isHeader to true;
        isHeader = typeof isHeader != 'undefined' ? isHeader : true;

        //if the element has a name, and [its not a combination of being stereotyped 'define' and being in the body - as we don't generally want #defines in the body
        // and its not an attribute of a struct, and in the class body (no struct info generated in class body)
        // logic here is: NOT (define AND body) = NOT (define AND NOT header) = NOT define OR header
        if (elem.name.length > 0 && (elem.stereotype !== 'define' || isHeader === true) && (elem._parent.stereotype !== 'struct' || isHeader === true)) {
            var terms = [];
            var docs = "";
            // will want to comment out non-static definitions in the body, but want to show them, as a reminder they need to be defined in a constructor
            var bodyCommentOut = "";

            //show attribute docs in the header
            if (isHeader === true) {
                // doc
                docs = this.getDocuments(elem.documentation);
            }

            // modifiers
            var _modifiers = this.getModifiers(elem);

            if (_modifiers.length > 0) {
                //remove 'static' and 'extern' modifiers if writing to body
                if (isHeader === false) {
                    var i;
                    for (i=0; i < _modifiers.length; i++) {
                        if (_modifiers[i] === "static" || _modifiers[i] === "extern") {
                            _modifiers.splice(i, 1);
                        }
                    }
                }

                //if removed the only modifier(s), then push a space to the terms
                if (_modifiers.length > 0) {
                    terms.push(_modifiers.join(" "));
                }
            }

            // type
            terms.push(this.getType(elem));

            //name
            //prefix static atributes with Class name in body (unless parent is not actually a Class)
            if (elem.isStatic === true && elem._parent.stereotype !== "noclass" && isHeader === false) {
                terms.push(elem._parent.name + "::" + elem.name);
            } else {
                terms.push(elem.name);
            }

            // initial value - don't generate in header
            // (primitive types can be initilized in the header, but for the sake of simplicity/consistency, just making declarations in header)
            if (isHeader === false) {
                if (elem.defaultValue && elem.defaultValue.length > 0) {
                    terms.push("= " + elem.defaultValue);
                }
            }

            //if this is a non-static attribute in the body, comment it out, but show it as a reminder that it needs to be defined
            if (!elem.isStatic && isHeader === false) {
                bodyCommentOut = "//";
            }

            return (docs + bodyCommentOut + terms.join(" ") + ";");
        }
    };

    /**
     * generate methods from operations[i]
     *
     * @param {Object} elem
     * @param {boolean} isCppBody
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getMethod = function (elem, isCppBody) {
        if (elem.name.length > 0) {
            var docs = elem.documentation;
            var i;
            var methodStr = "";
            var isVirtaul = false;
            // TODO virtual fianl static 키워드는 섞어 쓸수가 없다
            if (elem.isStatic === true) {
                methodStr += "static ";
            } else if (elem.isAbstract === true) {
                methodStr += "virtual ";
            }

            var returnTypeParam = _.filter(elem.parameters, function (params) {
                return params.direction === "return";
            });
            var inputParams = _.filter(elem.parameters, function (params) {
                return params.direction === "in";
            });
            var inputParamStrings = [];
            for (i = 0; i < inputParams.length; i++) {
                var inputParam = inputParams[i];
                inputParamStrings.push(this.getType(inputParam) + " " + inputParam.name);
                docs += "\n@param " + inputParam.name;
            }

            //small leap of faith here, but assume that any function defined in a class, with the name of the class, is a constructor, so don't generate a return type
            if (elem.name !== elem._parent.name) {
                methodStr += ((returnTypeParam.length > 0) ? this.getType(returnTypeParam[0]) : "void") + " ";
            }

            if (isCppBody) {
                var t_elem = elem;
                var specifier = "";
                var specification = "";

                // don't prefix method names with 'Classname::', if the class is stereotyped "noclass"
                if (t_elem._parent.stereotype !== "noclass" ) {
                    while (t_elem._parent instanceof type.UMLClass) {
                        specifier = t_elem._parent.name + "::" + specifier;
                        t_elem = t_elem._parent;
                    }
                }

                var indentLine = "";

                for (i = 0; i < this.genOptions.indentSpaces; i++) {
                    indentLine += " ";
                }

                methodStr += specifier;
                methodStr += elem.name;

                //if this is a constructor (method name same as class name), then treat items in 'specification' field as initialization list
                if (elem.name === elem._parent.name) {
                    specification = " " + elem.specification;
                }

                methodStr += "(" + inputParamStrings.join(", ") + ")" + specification + " {\n";
                if (returnTypeParam.length > 0) {
                    var returnType = this.getType(returnTypeParam[0]);
                    if (returnType === "boolean" || returnType === "bool") {
                        methodStr += indentLine + "return false;";
                    } else if (returnType === "int" || returnType === "long" || returnType === "short" || returnType === "byte") {
                        methodStr += indentLine + "return 0;";
                    } else if (returnType === "double" || returnType === "float") {
                        methodStr += indentLine + "return 0.0;";
                    } else if (returnType === "char") {
                        methodStr += indentLine + "return '0';";
                    } else if (returnType === "string" || returnType === "String") {
                        methodStr += indentLine + 'return "";';
                    } else if (returnType === "void") {
                        methodStr += indentLine + "return;";
                    } else {
                        methodStr += indentLine + "return NULL;";
                    }
                    docs += "\n@return " + returnType;
                }
                methodStr += "\n}";
            } else {
                methodStr += elem.name;
                methodStr += "(" + inputParamStrings.join(", ") + ")";

                if (elem.isLeaf === true) {
                    methodStr += " final";
                } else if (elem.isAbstract === true) { // TODO 만약 virtual 이면 모두 pure virtual? 체크 할것
                    methodStr += " = 0";
                }
                methodStr += ";";
            }


            return "\n" + this.getDocuments(docs) + methodStr;
        }
    };

    /**
     * generate doc string from doc element
     *
     * @param {Object} text
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getDocuments = function (text) {
        var docs = "";
        if (_.isString(text) && text.length !== 0) {
            var lines = text.trim().split("\n");
            docs += "/**\n";
            var i;
            for (i = 0; i < lines.length; i++) {
                docs += " * " + lines[i] + "\n";
            }
            docs += " */\n";
        }
        return docs;
    };

    /**
     * parsing visibility from element
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getVisibility = function (elem) {
        switch (elem.visibility) {
        case UML.VK_PUBLIC:
            return "public";
        case UML.VK_PROTECTED:
            return "protected";
        case UML.VK_PRIVATE:
            return "private";
        }
        return null;
    };

    /**
     * parsing modifiers from element
     *
     * @param {Object} elem
     * @return {Object} list
     */
    CppCodeGenerator.prototype.getModifiers = function (elem) {
        var modifiers = [];

        if (elem.stereotype === "extern") {
            modifiers.push("extern");
        }
        if (elem.isStatic === true) {
            modifiers.push("static");
        }
        if (elem.isReadOnly === true) {
            modifiers.push("const");
        }
        if (elem.isAbstract === true) {
            modifiers.push("virtual");
        }

        return modifiers;
    };

    /**
     * parsing type from element
     *
     * @param {Object} elem
     * @return {Object} string
     */
    CppCodeGenerator.prototype.getType = function (elem) {
        var _type = "void";

        if (elem instanceof type.UMLAssociationEnd) { // member variable from association
            if (elem.reference instanceof type.UMLModelElement && elem.reference.name.length > 0) {
                _type = elem.reference.name;
            }
        } else { // member variable inside class
            if (elem.type instanceof type.UMLModelElement && elem.type.name.length > 0) {
                _type = elem.type.name;
            } else if (_.isString(elem.type) && elem.type.length > 0) {
                _type = elem.type;
            }
        }

        // multiplicity
        if (elem.multiplicity) {
            if (_.contains(["0..*", "1..*", "*"], elem.multiplicity.trim())) {
                if (elem.isOrdered === true) {
                    _type = "Vector<" + _type + ">";
                } else {
                    _type = "Vector<" + _type + ">";
                }
            } else if (elem.multiplicity !== "1" && elem.multiplicity.match(/^\d+$/)) { // number
                //TODO check here
                _type += "[]";
            }
        }
        return _type;
    };

    /**
     * get all super class / interface from element
     *
     * @param {Object} elem
     * @return {Object} list
     */
    CppCodeGenerator.prototype.getSuperClasses = function (elem) {
        var generalizations = Repository.getRelationshipsOf(elem, function (rel) {
            return ((rel instanceof type.UMLGeneralization || rel instanceof type.UMLInterfaceRealization) && rel.source === elem);
        });
        return generalizations;
    };



    function generate(baseModel, basePath, options) {
        var result = new $.Deferred();
        var cppCodeGenerator = new CppCodeGenerator(baseModel, basePath);
        return cppCodeGenerator.generate(baseModel, basePath, options);
    }

    function getVersion() {return versionString; }

    exports.generate = generate;
    exports.getVersion = getVersion;
});
