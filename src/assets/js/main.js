import ExampleModule from "./modules/ExampleModule";

(function($, window, document) {
    $(function() {

        ExampleModule();

        setTimeout( () => console.log('arrow function!'), 2000 );

    });
}(window.jQuery, window, document));
